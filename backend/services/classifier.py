from __future__ import annotations

from db.models import EmergencyType, Severity

TYPE_KEYWORDS: list[tuple[EmergencyType, tuple[str, ...]]] = [
    (EmergencyType.flood, ("flood", "water rising", "rising water", "water level", "drowning", "boat", "washed away", "stuck in water")),
    (EmergencyType.fire, ("fire", "smoke", "burning", "flames", "explosion", "ash", "gas leak")),
    (EmergencyType.trapped, ("trapped", "collapse", "collapsed", "stuck", "debris", "cannot get out", "under rubble", "blocked in")),
    (EmergencyType.medical, ("bleeding", "unconscious", "chest pain", "injured", "fracture", "pregnant", "medical", "heart attack", "not breathing")),
]

CRITICAL_TERMS = (
    "not breathing",
    "unconscious",
    "severe bleeding",
    "bleeding badly",
    "drowning",
    "water over",
    "trapped",
    "cannot get out",
    "under rubble",
    "collapse",
    "collapsed",
    "fire inside",
    "smoke filling",
    "explosion",
)

URGENT_TERMS = (
    "injured",
    "cannot move",
    "need rescue",
    "water rising",
    "smoke nearby",
    "elderly",
    "child",
    "children",
    "pregnant",
    "disabled",
    "stranded",
)

LOW_TERMS = (
    "need supplies",
    "food",
    "water",
    "medicine",
    "stable",
    "safe for now",
)


def extract_field(message: str | None, label: str) -> str:
    for line in (message or "").splitlines():
        if line.startswith(f"{label}:"):
            return line.split(":", 1)[1].strip()
    return ""


def infer_emergency_type(message: str | None) -> EmergencyType:
    text = (message or "").lower()
    if not text:
        return EmergencyType.unknown

    for emergency_type, terms in TYPE_KEYWORDS:
        if any(term in text for term in terms):
            return emergency_type

    return EmergencyType.unknown


def infer_severity(message: str | None, emergency_type: EmergencyType, has_audio: bool, has_image: bool) -> tuple[Severity, str, float]:
    text = (message or "").lower()

    if any(term in text for term in CRITICAL_TERMS):
        return Severity.critical, "Immediate life-risk language detected in the report.", 0.9

    if emergency_type in {EmergencyType.fire, EmergencyType.trapped} and (has_audio or has_image):
        return Severity.critical, "The incident appears high-risk and includes direct evidence.", 0.82

    if any(term in text for term in URGENT_TERMS):
        return Severity.urgent, "The report indicates people need prompt rescue support.", 0.74

    if any(term in text for term in LOW_TERMS):
        return Severity.low, "The report reads as stable but still in need of support.", 0.62

    if has_audio or has_image:
        return Severity.urgent, "Evidence was attached, but the situation detail is limited.", 0.6

    return Severity.urgent, "The request needs review, but the details are limited.", 0.52


def fallback_triage(message: str | None, has_audio: bool = False, has_image: bool = False) -> dict:
    emergency_type = infer_emergency_type(message)
    severity, reason, confidence = infer_severity(message, emergency_type, has_audio, has_image)
    return {
        "severity": severity.value,
        "emergency_type": emergency_type.value,
        "reason": reason,
        "confidence": confidence,
        "ai_available": False,
    }
