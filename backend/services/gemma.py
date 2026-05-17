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
An algorithmic scorer has already ranked responders by role match, skill coverage, distance, battery, and sector.
Your job is to apply contextual judgment the algorithm cannot: interpret victim messages, audio/image signals,
and multi-victim nuance. You may confirm the algorithm's top pick or override it — but you must justify any override.

TEAM DISPATCH: For critical or complex situations (multiple victims, severe injuries, structural hazards),
you may dispatch a team of 2 responders with complementary roles. Use team_codes only when genuinely needed —
sending two responders reduces availability for other emergencies.
Always return valid JSON only."""

TRIAGE_TEMPLATE = """{system}

ROLE: You are a strict emergency dispatcher. You MUST output ONLY valid JSON matching the exact schema below. Never explain your answer, never write notes, never add introductory text, and never use bullet points.

FEW-SHOT MULTILINGUAL EXAMPLES:

EXAMPLE 1 (Telugu Input):
VICTIM REPORT:
- Victim: V-EX-1
- Reporter packet:
వరద నీరు ఇంట్లోకి వచ్చేసింది, సహాయం కావాలి.
- Audio attached: False
- Image attached: False
- User hint for type: blank
- User hint for severity: blank

JSON OUTPUT:
{{"severity": "urgent", "emergency_type": "flood", "reason": "Flood waters have entered the victim's house, requiring urgent rescue support.", "confidence": 0.9, "people_count": 1, "calamity": "Flood", "age": "Unknown", "medical_conditions": "None", "quick_needs": "Evacuation and rescue support", "voice_transcript": "", "consciousness_status": "Awake", "mobility_status": "Walking", "hazards": "None"}}

EXAMPLE 2 (Malayalam Input):
VICTIM REPORT:
- Victim: V-EX-2
- Reporter packet:
ഞങ്ങൾക്ക് അടിയന്തിരമായി കുടിവെള്ളവും മരുന്നുകളും വേണം.
- Audio attached: False
- Image attached: False
- User hint for type: blank
- User hint for severity: blank

JSON OUTPUT:
{{"severity": "urgent", "emergency_type": "medical", "reason": "Victims require urgent drinking water and medical supplies.", "confidence": 0.85, "people_count": 1, "calamity": "Resource shortage", "age": "Unknown", "medical_conditions": "Unknown", "quick_needs": "Drinking water and medicines", "voice_transcript": "", "consciousness_status": "Awake", "mobility_status": "Walking", "hazards": "None"}}


NOW PROCESS THIS REAL EMERGENCY:
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

If `has_audio` is True or the message implies spoken text, provide transcript fields. Otherwise use the typed report where appropriate.
Transcript fields:
- `original_transcript`: best-effort transcript in the victim's original language/script, or romanized source words if script is unavailable. Empty string if unavailable.
- `english_transcript`: faithful English translation of what the victim said. Empty string if unavailable.
- `victim_statement`: responder-friendly English summary of what the victim said or reported.
- `voice_transcript`: legacy alias; set it to the same value as `english_transcript`.
Extract additional details from the message into these fields (DO NOT use null, use "Unknown" or "None" if missing):
- `people_count`: <int> (default to 1)
- `calamity`: <string> (specific disaster or event type)
- `age`: <string> (e.g. "30s", "child", "Unknown")
- `medical_conditions`: <string> (e.g. "Asthma", "None")
- `quick_needs`: <string> (e.g. "Water", "Evacuation", "Unknown")
- `consciousness_status`: <string> (e.g. "Awake", "Unconscious", "Unknown")
- `mobility_status`: <string> (e.g. "Walking", "Trapped", "Unknown")
- `hazards`: <string> (e.g. "Fire", "Gas Leak", "None")

IMPORTANT: The victim message may be in any language including Telugu, Hindi, Malayalam, or other regional languages.
You MUST translate and output all fields in ENGLISH only, except original_transcript, which should preserve the victim's original language/script when possible.

Return ONLY this JSON:
{{"severity": "<critical|urgent|low>", "emergency_type": "<medical|trapped|flood|fire|unknown>", "reason": "<one sentence explaining criticality>", "confidence": <0.0-1.0>, "people_count": <int>, "calamity": "<string>", "age": "<string>", "medical_conditions": "<string>", "quick_needs": "<string>", "original_transcript": "<string>", "english_transcript": "<string>", "victim_statement": "<string>", "voice_transcript": "<string>", "consciousness_status": "<string>", "mobility_status": "<string>", "hazards": "<string>"}}"""


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
- Recommended team support role: {team_support_role}

ALGORITHM-RANKED CANDIDATES (already scored 0-1):
{candidates_block}

Confirm or override. For single dispatch omit team_codes. Return ONLY this JSON:
{{"assign": "<primary_code>", "team_codes": ["<code1>", "<code2>"], "team_reason": "<why team needed>", "reason": "<one sentence>", "eta_minutes": <int>, "confidence": <0.0-1.0>, "override": <true|false>}}
Note: team_codes is optional. Only include it when a multi-responder team is genuinely required."""


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


def _json_payload(prompt: str, audio_base64: str | None = None) -> dict:
    parts = []
    if audio_base64:
        parts.append({
            "inlineData": {
                "mimeType": "audio/wav",
                "data": audio_base64
            }
        })
    parts.append({"text": prompt})

    return {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
        },
    }


def _client() -> httpx.AsyncClient:
    # Local dev has had TLS trust-chain issues; allow a clean fallback toggle.
    verify = False if getattr(settings, "GEMINI_INSECURE_SKIP_VERIFY", True) else True
    return httpx.AsyncClient(timeout=90.0, verify=verify)


async def _call_gemma(prompt: str, audio_base64: str | None = None, model: str | None = None) -> dict:
    use_model = model or settings.GEMMA_MODEL
    url = GEMINI_URL.format(model=use_model, key=settings.GEMINI_API_KEY)
    async with _client() as client:
        resp = await client.post(url, json=_json_payload(prompt, audio_base64))
        if not resp.is_success:
            import logging
            logging.getLogger(__name__).error("Gemma API body: %s", resp.text)
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        
        import re
        # 1. Search for markdown code blocks (e.g. ```json ... ``` or ``` ... ```)
        code_blocks = re.findall(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        for block in reversed(code_blocks):
            try:
                return json.loads(block.strip())
            except json.JSONDecodeError:
                pass

        # 2. If no valid JSON in code blocks, search for any JSON-like structures in the raw text.
        # Scan for '{' from right to left (since the answer is usually at the end)
        for i in range(len(text) - 1, -1, -1):
            if text[i] == '{':
                for j in range(len(text) - 1, i, -1):
                    if text[j] == '}':
                        candidate = text[i:j+1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            continue
                            
        # 3. Model truncated mid-JSON fallback
        stripped = re.sub(r'```(?:json)?\s*', '', text).strip()
        brace_start = stripped.find('{')
        if brace_start != -1:
            partial = stripped[brace_start:]
            lines = partial.rstrip().splitlines()
            while lines and not lines[-1].rstrip().endswith(('},', '}', '",', '"')):
                lines.pop()
            last = lines[-1].rstrip().rstrip(',') if lines else ''
            if lines:
                lines[-1] = last
            closed = '\n'.join(lines) + '\n}'
            try:
                return json.loads(closed)
            except json.JSONDecodeError:
                pass

        raise ValueError(f"No JSON found in response: {text[:200]}")


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
        result = await _call_gemma(prompt, sos.get("audio_base64"), model=settings.GEMMA_TRIAGE_MODEL)
        return {
            "severity": _normalize_severity(result.get("severity")),
            "emergency_type": _normalize_type(result.get("emergency_type")),
            "reason": result.get("reason") or "AI triage completed.",
            "confidence": float(result.get("confidence", 0.7)),
            "people_count": result.get("people_count"),
            "calamity": result.get("calamity"),
            "age": result.get("age"),
            "medical_conditions": result.get("medical_conditions"),
            "quick_needs": result.get("quick_needs"),
            "original_transcript": result.get("original_transcript"),
            "english_transcript": result.get("english_transcript"),
            "victim_statement": result.get("victim_statement"),
            "voice_transcript": result.get("voice_transcript") or result.get("english_transcript"),
            "consciousness_status": result.get("consciousness_status"),
            "mobility_status": result.get("mobility_status"),
            "hazards": result.get("hazards"),
            "ai_available": True,
        }
    except Exception as e:
        try:
            print(f"GEMMA TRIAGE ERROR: {repr(e)}")
            import traceback
            traceback.print_exc()
        except Exception:
            pass
        return fallback_triage(sos.get("message"), sos.get("has_audio", False), sos.get("has_image", False))


async def triage_and_assign(sos: dict, ranked_candidates: list[dict]) -> dict:
    """
    Call Gemma 4 via Google AI Studio.
    Falls back to the algorithm's top pick if the API is unreachable or key is unset.
    """
    if not ranked_candidates:
        return {}

    if not settings.GEMINI_API_KEY:
        return _fallback(ranked_candidates, sos)

    top = ranked_candidates[0]
    profile = top.get("ontology", {})

    from services.ontology import get_profile
    etype_profile = get_profile(sos.get("emergency_type", "unknown"))
    team_support = ", ".join(etype_profile.team_support_roles) or "none"

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
        team_support_role=team_support,
        candidates_block=_format_candidates(ranked_candidates),
    )

    try:
        result = await _call_gemma(prompt)
        result["ai_available"] = True
        return result
    except Exception:
        return _fallback(ranked_candidates, sos)


def _fallback(ranked_candidates: list[dict], sos: dict | None = None) -> dict:
    """Algorithm top pick — used when AI Studio is unreachable or key is unset."""
    best = ranked_candidates[0]
    result = {
        "assign": best["code"],
        "reason": f"Closest suitable team by score {best['composite_score']:.2f}, role {best['role']}, and distance {best['distance_m']:.0f} m.",
        "eta_minutes": best["eta_minutes"],
        "confidence": best["composite_score"],
        "override": False,
        "ai_available": False,
    }
    # Auto team dispatch: critical severity + primary role covers <70% of required skills
    if sos and sos.get("severity") == "critical":
        from services.ontology import get_profile
        profile = get_profile(sos.get("emergency_type", "unknown"))
        skill_coverage = best.get("ontology", {}).get("skill_coverage", 1.0)
        if skill_coverage < 0.7 and profile.team_support_roles:
            support_role = profile.team_support_roles[0]
            support = next(
                (c for c in ranked_candidates[1:] if c["role"] == support_role),
                None,
            )
            if support:
                result["team_codes"] = [best["code"], support["code"]]
                result["team_reason"] = (
                    f"Critical case with {skill_coverage:.0%} skill coverage — "
                    f"adding {support_role} ({support['code']}) for full response."
                )
    return result
