"""
Gemma 4 triage layer - powered by Google AI Studio.
Receives neutral victim packets, classifies criticality, then helps choose the
best responder from algorithm-ranked candidates.
"""
from __future__ import annotations

import json

import httpx

from db.database import settings
from db.models import EmergencyType, Severity
from services.classifier import fallback_triage

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models"
    "/{model}:generateContent?key={key}"
)

SYSTEM_PROMPT = """You are the final-decision AI in ZeroHour, a disaster response system.
You must read victim details carefully, infer meaning from multilingual text, voice transcripts, and evidence hints,
assign the most likely emergency type, assess severity, and then help route the nearest suitable responder.
Always return valid JSON only."""

TRIAGE_TEMPLATE = """{system}

VICTIM REPORT:
- Victim: {victim_code}
- Reporter packet:
{message}
- Audio attached: {has_audio}
- Image attached: {has_image}
- User hint for type: {submitted_type}
- User hint for severity: {submitted_severity}

Infer the final emergency type and final severity from the full report. Do not simply mirror the user hints.
Allowed emergency_type values: medical, trapped, flood, fire, unknown
Allowed severity values: critical, urgent, low

If `has_audio` is True or the message implies spoken text, provide a `voice_transcript`. Otherwise leave empty.
Estimate the number of people involved (`people_count`) based on the message or default to 1.

Return ONLY this JSON:
{{"severity": "<critical|urgent|low>", "emergency_type": "<medical|trapped|flood|fire|unknown>", "reason": "<one sentence explaining criticality>", "confidence": <0.0-1.0>, "people_count": <int>, "voice_transcript": "<string>"}}"""


ASSIGNMENT_TEMPLATE = """{system}

EMERGENCY:
- Victim: {victim_code} | Final severity: {severity} | Final type: {emergency_type}
- Message: "{message}"
- Criticality reasoning: "{triage_reason}"
- The message may be multilingual. Infer meaning before assigning.
- Audio distress detected: {has_audio} | Image attached: {has_image}
- Urgency multiplier (time-decay): {urgency}x

REQUIRED by ontology:
- Skills: {required_skills}
- Equipment: {required_equipment}

ALGORITHM-RANKED CANDIDATES (already scored 0-1):
{candidates_block}

Confirm or override. Return ONLY this JSON:
{{"assign": "<code>", "reason": "<one sentence explaining the responder choice>", "eta_minutes": <int>, "confidence": <0.0-1.0>, "override": <true|false>}}"""


def _format_candidates(candidates: list[dict]) -> str:
    lines = []
    for i, c in enumerate(candidates, 1):
        onto = c.get("ontology", {})
        matched = ", ".join(onto.get("skills_matched", [])) or "none"
        missing = ", ".join(onto.get("skills_missing", [])) or "none"
        lines.append(
            f"{i}. [{c['composite_score']:.2f}] {c['code']} | {c['role']} | "
            f"{c['distance_m']:.0f}m | battery {c['battery']}% | "
            f"skills matched: {matched}; missing: {missing}"
        )
    return "\n".join(lines)


def _json_payload(prompt: str) -> dict:
    return {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }


def _client() -> httpx.AsyncClient:
    # Local dev has had TLS trust-chain issues; allow a clean fallback toggle.
    verify = False if getattr(settings, "GEMINI_INSECURE_SKIP_VERIFY", True) else True
    return httpx.AsyncClient(timeout=30.0, verify=verify)


async def _call_gemma(prompt: str) -> dict:
    url = GEMINI_URL.format(model=settings.GEMINI_MODEL, key=settings.GEMINI_API_KEY)
    async with _client() as client:
        resp = await client.post(url, json=_json_payload(prompt))
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)


def _normalize_type(value: str | None) -> str:
    allowed = {member.value for member in EmergencyType}
    return value if value in allowed else EmergencyType.unknown.value


def _normalize_severity(value: str | None) -> str:
    allowed = {member.value for member in Severity}
    return value if value in allowed else Severity.urgent.value


async def triage_packet(sos: dict) -> dict:
    if not settings.GEMINI_API_KEY:
        return fallback_triage(sos.get("message"), sos.get("has_audio", False), sos.get("has_image", False))

    prompt = TRIAGE_TEMPLATE.format(
        system=SYSTEM_PROMPT,
        victim_code=sos["victim_code"],
        message=sos.get("message") or "No message",
        has_audio=sos.get("has_audio", False),
        has_image=sos.get("has_image", False),
        submitted_type=sos.get("submitted_emergency_type") or "blank",
        submitted_severity=sos.get("submitted_severity") or "blank",
    )

    try:
        result = await _call_gemma(prompt)
        return {
            "severity": _normalize_severity(result.get("severity")),
            "emergency_type": _normalize_type(result.get("emergency_type")),
            "reason": result.get("reason") or "AI triage completed.",
            "confidence": float(result.get("confidence", 0.7)),
            "people_count": result.get("people_count"),
            "voice_transcript": result.get("voice_transcript"),
            "ai_available": True,
        }
    except Exception:
        return fallback_triage(sos.get("message"), sos.get("has_audio", False), sos.get("has_image", False))


async def triage_and_assign(sos: dict, ranked_candidates: list[dict]) -> dict:
    """
    Call Gemma 4 via Google AI Studio.
    Falls back to the algorithm's top pick if the API is unreachable or key is unset.
    """
    if not ranked_candidates:
        return {}

    if not settings.GEMINI_API_KEY:
        return _fallback(ranked_candidates)

    top = ranked_candidates[0]
    profile = top.get("ontology", {})

    prompt = ASSIGNMENT_TEMPLATE.format(
        system=SYSTEM_PROMPT,
        victim_code=sos["victim_code"],
        severity=sos["severity"],
        emergency_type=sos["emergency_type"],
        message=sos.get("message") or "No message",
        triage_reason=sos.get("triage_reason") or "No triage rationale provided.",
        has_audio=sos.get("has_audio", False),
        has_image=sos.get("has_image", False),
        urgency=top.get("urgency_multiplier", 1.0),
        required_skills=", ".join(profile.get("required_skills", [])),
        required_equipment=", ".join(profile.get("required_equipment", [])),
        candidates_block=_format_candidates(ranked_candidates),
    )

    try:
        result = await _call_gemma(prompt)
        result["ai_available"] = True
        return result
    except Exception:
        return _fallback(ranked_candidates)


def _fallback(ranked_candidates: list[dict]) -> dict:
    best = ranked_candidates[0]
    return {
        "assign": best["code"],
        "reason": f"Closest suitable team by score {best['composite_score']:.2f}, role {best['role']}, and distance {best['distance_m']:.0f} m.",
        "eta_minutes": best["eta_minutes"],
        "confidence": best["composite_score"],
        "override": False,
        "ai_available": False,
    }
