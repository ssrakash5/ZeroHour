"""
Gemma 4 triage layer — powered by Google AI Studio (Gemma 4 27B).
Receives pre-scored candidates from the algorithmic layer.
Its job: contextual reasoning over free text and nuanced multi-victim
scenarios — not basic routing math.
"""
import json
import httpx
from db.database import settings

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models"
    "/{model}:generateContent?key={key}"
)

SYSTEM_PROMPT = """You are the final-decision AI in ZeroHour, a disaster response system.
An algorithmic scorer has already ranked responders by role match, skill coverage, distance, battery, and sector.
Your job is to apply contextual judgment the algorithm cannot: interpret victim messages, audio/image signals,
and multi-victim nuance. You may confirm the algorithm's top pick or override it — but you must justify any override.
Always return valid JSON only."""

ASSIGNMENT_TEMPLATE = """{system}

EMERGENCY:
- Victim: {victim_code} | Severity: {severity} | Type: {emergency_type}
- Message: "{message}"
- Audio distress detected: {has_audio} | Image attached: {has_image}
- Urgency multiplier (time-decay): {urgency}x

REQUIRED by ontology:
- Skills: {required_skills}
- Equipment: {required_equipment}

ALGORITHM-RANKED CANDIDATES (already scored 0-1):
{candidates_block}

Confirm or override. Return ONLY this JSON:
{{"assign": "<code>", "reason": "<one sentence>", "eta_minutes": <int>, "confidence": <0.0-1.0>, "override": <true|false>}}"""


def _format_candidates(candidates: list[dict]) -> str:
    lines = []
    for i, c in enumerate(candidates, 1):
        onto = c.get("ontology", {})
        matched = ", ".join(onto.get("skills_matched", [])) or "none"
        missing = ", ".join(onto.get("skills_missing", [])) or "none"
        lines.append(
            f"{i}. [{c['composite_score']:.2f}] {c['code']} | {c['role']} | "
            f"{c['distance_m']:.0f}m | battery {c['battery']}% | "
            f"skills ✓{matched} ✗{missing}"
        )
    return "\n".join(lines)


async def triage_and_assign(sos: dict, ranked_candidates: list[dict]) -> dict:
    """
    Call Gemma 4 27B via Google AI Studio.
    Falls back to algorithm's top pick if the API is unreachable or key is unset.
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
        has_audio=sos.get("has_audio", False),
        has_image=sos.get("has_image", False),
        urgency=top.get("urgency_multiplier", 1.0),
        required_skills=", ".join(profile.get("required_skills", [])),
        required_equipment=", ".join(profile.get("required_equipment", [])),
        candidates_block=_format_candidates(ranked_candidates),
    )

    url = GEMINI_URL.format(model=settings.GEMINI_MODEL, key=settings.GEMINI_API_KEY)
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            result = json.loads(text)
            result["ai_available"] = True
            return result
    except Exception:
        return _fallback(ranked_candidates)


def _fallback(ranked_candidates: list[dict]) -> dict:
    """Algorithm top pick — used when AI Studio is unreachable or key is unset."""
    best = ranked_candidates[0]
    return {
        "assign": best["code"],
        "reason": f"Algorithm top pick: score {best['composite_score']:.2f} — {best['role']} at {best['distance_m']:.0f} m.",
        "eta_minutes": best["eta_minutes"],
        "confidence": best["composite_score"],
        "override": False,
        "ai_available": False,
    }
