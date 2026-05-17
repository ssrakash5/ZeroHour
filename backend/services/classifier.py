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


import re

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
    
    msg_text = message or ""
    
    # 1. People count
    people_count = None
    word_to_num = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
    }
    # Match both digits and word numbers, e.g., "Two people" or "2 people"
    people_match = re.search(r'\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:people|persons|victims|family members|patients)\b', msg_text, re.IGNORECASE)
    if people_match:
        val = people_match.group(1).lower()
        if val.isdigit():
            people_count = int(val)
        else:
            people_count = word_to_num.get(val, 1)
    elif "single person" in msg_text.lower() or "one person" in msg_text.lower() or "i am" in msg_text.lower():
        people_count = 1
    elif "family of" in msg_text.lower():
        fam_match = re.search(r'family of\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)', msg_text, re.IGNORECASE)
        if fam_match:
            val = fam_match.group(1).lower()
            if val.isdigit():
                people_count = int(val)
            else:
                people_count = word_to_num.get(val, 1)
            
    # 2. Calamity
    calamity = None
    if "earthquake" in msg_text.lower():
        calamity = "Earthquake"
    elif "flood" in msg_text.lower() or "drowning" in msg_text.lower():
        calamity = "Flood"
    elif "fire" in msg_text.lower() or "explosion" in msg_text.lower():
        calamity = "Fire / Gas Explosion"
    elif "storm" in msg_text.lower() or "hurricane" in msg_text.lower():
        calamity = "Storm / Natural Disaster"
    else:
        calamity = emergency_type.value.capitalize()

    # 3. Age
    age = None
    age_match = re.search(r'\b(\d+)\s*(?:years?|yrs?)\s*(?:old)?\b', msg_text, re.IGNORECASE)
    if age_match:
        age = f"{age_match.group(1)} years old"
    elif "child" in msg_text.lower() or "son" in msg_text.lower() or "daughter" in msg_text.lower():
        age = "Child"
    elif "elderly" in msg_text.lower() or "parents" in msg_text.lower() or "aged" in msg_text.lower():
        aged_match = re.search(r'aged\s*(\d+)', msg_text, re.IGNORECASE)
        if aged_match:
            age = f"Elderly ({aged_match.group(1)} years old)"
        else:
            age = "Elderly"

    # 4. Medical Conditions
    meds = []
    if "diabetes" in msg_text.lower() or "diabetic" in msg_text.lower():
        meds.append("Diabetes")
    if "heart condition" in msg_text.lower() or "heart attack" in msg_text.lower():
        meds.append("Heart Condition")
    if "broken leg" in msg_text.lower() or "broken arm" in msg_text.lower() or "fracture" in msg_text.lower():
        meds.append("Bone Fracture")
    if "burn" in msg_text.lower() or "burned" in msg_text.lower():
        meds.append("Severe Burns")
    if "cuts" in msg_text.lower() or "bruises" in msg_text.lower() or "bleeding" in msg_text.lower():
        meds.append("Trauma / Bleeding")
    if "asthma" in msg_text.lower() or "breathing" in msg_text.lower():
        meds.append("Respiratory Distress")
    medical_conditions = ", ".join(meds) if meds else "None detected"

    # 5. Quick Needs
    needs = []
    if "oxygen" in msg_text.lower() or "o2" in msg_text.lower():
        needs.append("Oxygen")
    if "medical help" in msg_text.lower() or "doctor" in msg_text.lower() or "medical attention" in msg_text.lower():
        needs.append("Medical Assistance")
    if "ambulance" in msg_text.lower():
        needs.append("Ambulance")
    if "boat" in msg_text.lower() or "rescue boat" in msg_text.lower():
        needs.append("Water Rescue Boat")
    if "evacuation" in msg_text.lower() or "evacuate" in msg_text.lower():
        needs.append("Evacuation")
    if "food" in msg_text.lower() or "water" in msg_text.lower():
        needs.append("Rations & Water")
    quick_needs = ", ".join(needs) if needs else "Immediate evacuation"

    # 6. Hazards
    hazards = "None"
    if "collapsed" in msg_text.lower() or "collapse" in msg_text.lower():
        hazards = "Structural Collapse"
    if "gas leak" in msg_text.lower() or "gas explosion" in msg_text.lower():
        hazards = "Toxic Gas / Fire Hazard"
    if "flood" in msg_text.lower():
        hazards = "Rising Water"

    # 7. Mobility
    mobility = "Walking"
    if "trapped" in msg_text.lower() or "stuck" in msg_text.lower():
        mobility = "Trapped"
    elif "cannot walk" in msg_text.lower() or "unable to move" in msg_text.lower() or "broken leg" in msg_text.lower():
        mobility = "Immobilized"
    elif "unconscious" in msg_text.lower():
        mobility = "Unconscious / Unresponsive"

    return {
        "severity": severity.value,
        "emergency_type": emergency_type.value,
        "reason": reason,
        "confidence": confidence,
        "people_count": people_count,
        "calamity": calamity,
        "age": age,
        "medical_conditions": medical_conditions,
        "quick_needs": quick_needs,
        "original_transcript": msg_text if has_audio else None,
        "english_transcript": msg_text if has_audio else None,
        "victim_statement": msg_text or reason,
        "voice_transcript": "Processed via on-device audio transducer" if has_audio else None,
        "consciousness_status": "Unconscious" if "unconscious" in msg_text.lower() else "Awake",
        "mobility_status": mobility,
        "hazards": hazards,
        "ai_available": False,
    }
