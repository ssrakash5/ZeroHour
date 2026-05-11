import json
import httpx
from db.database import settings


SYSTEM_PROMPT = """You are an AI triage coordinator for a disaster response system called ZeroHour.
Your job is to assign the single best available responder to an incoming SOS.
You must weigh: emergency type vs responder role, proximity, and responder capacity.
Always return valid JSON. Never add commentary outside the JSON object."""

ASSIGNMENT_TEMPLATE = """{system}

NEW SOS PACKET:
- Victim: {victim_code}
- Location: {lat}, {lng}
- Severity: {severity}
- Type: {emergency_type}
- Message: "{message}"
- Audio distress: {has_audio} | Image: {has_image}

AVAILABLE RESPONDERS (sorted by distance):
{responder_list}

Assign the single best responder. Return ONLY this JSON:
{{"assign": "<responder_code>", "reason": "<one sentence>", "eta_minutes": <int>, "confidence": <0.0-1.0>}}"""


def _format_responders(candidates: list[dict]) -> str:
    lines = []
    for i, r in enumerate(candidates, 1):
        lines.append(
            f"{i}. {r['code']} | {r['role']} | {r['distance_m']:.0f} m away | "
            f"status: {r['status']} | battery: {r['battery']}%"
        )
    return "\n".join(lines)


async def triage_and_assign(sos: dict, candidates: list[dict]) -> dict:
    """
    Call Gemma 4 via Ollama and return the parsed assignment dict.
    Falls back to nearest role-matched responder if Ollama is unreachable.
    """
    prompt = ASSIGNMENT_TEMPLATE.format(
        system=SYSTEM_PROMPT,
        victim_code=sos["victim_code"],
        lat=sos["lat"],
        lng=sos["lng"],
        severity=sos["severity"],
        emergency_type=sos["emergency_type"],
        message=sos.get("message") or "No message",
        has_audio=sos.get("has_audio", False),
        has_image=sos.get("has_image", False),
        responder_list=_format_responders(candidates),
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.OLLAMA_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            raw = resp.json()["response"]
            result = json.loads(raw)
            return result
    except Exception:
        # Fallback: pick nearest role-matched or just nearest
        return _fallback_assign(sos, candidates)


def _fallback_assign(sos: dict, candidates: list[dict]) -> dict:
    role_pref = {"medical": "medic", "flood": "rescue", "fire": "fire", "trapped": "rescue"}.get(
        sos.get("emergency_type", "unknown"), "medic"
    )
    matched = [c for c in candidates if c["role"] == role_pref] or candidates
    best = min(matched, key=lambda c: c["distance_m"])
    eta = max(1, round(best["distance_m"] / 84))  # ~5 km/h
    return {
        "assign": best["code"],
        "reason": f"Nearest {best['role']} ({best['distance_m']:.0f} m). AI unavailable — fallback logic used.",
        "eta_minutes": eta,
        "confidence": 0.6,
    }
