"""
Static knowledge base: emergency types → required skills, equipment, best role.
This is pure rule-based logic — no LLM involved.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class EmergencyProfile:
    required_role: str
    compatible_roles: tuple[str, ...]
    skills: tuple[str, ...]
    equipment: tuple[str, ...]
    severity_weight: float      # how fast urgency degrades over time
    max_response_min: int       # golden-hour threshold for this type
    # Roles to add when dispatching a team (critical/multi-victim scenarios)
    team_support_roles: tuple[str, ...]  = ()


EMERGENCY_ONTOLOGY: dict[str, EmergencyProfile] = {
    "medical": EmergencyProfile(
        required_role="medic",
        compatible_roles=("medic",),
        skills=("CPR", "Trauma Care", "ALS", "Hemorrhage Control"),
        equipment=("Defibrillator", "First Aid Kit", "Stretcher", "O2 Tank", "IV Kit"),
        severity_weight=1.6,
        max_response_min=10,
        team_support_roles=("rescue",),   # rescue for extrication to reach patient
    ),
    "trapped": EmergencyProfile(
        required_role="rescue",
        compatible_roles=("rescue", "fire"),
        skills=("Extrication", "Structural Assessment", "Rope Rescue", "Shoring"),
        equipment=("Hydraulic Cutters", "Rope", "Hard Hat", "Shoring Kit", "Search Camera"),
        severity_weight=1.2,
        max_response_min=20,
        team_support_roles=("medic",),    # medic to treat injuries on extraction
    ),
    "flood": EmergencyProfile(
        required_role="rescue",
        compatible_roles=("rescue",),
        skills=("Water Rescue", "Boat Operation", "Swim Rescue"),
        equipment=("Life Ring", "Inflatable Boat", "Rope", "Life Jacket", "Throw Bag"),
        severity_weight=1.3,
        max_response_min=15,
        team_support_roles=("medic",),    # medic for hypothermia/drowning care
    ),
    "fire": EmergencyProfile(
        required_role="fire",
        compatible_roles=("fire",),
        skills=("Fire Suppression", "Hazmat", "Evacuation", "Search & Rescue"),
        equipment=("Breathing Apparatus", "Fire Extinguisher", "Hose", "Thermal Camera", "PPE"),
        severity_weight=1.5,
        max_response_min=8,
        team_support_roles=("medic",),    # medic for burns/smoke inhalation
    ),
    "unknown": EmergencyProfile(
        required_role="medic",
        compatible_roles=("medic", "rescue", "fire"),
        skills=("First Aid", "Assessment"),
        equipment=("First Aid Kit",),
        severity_weight=1.0,
        max_response_min=20,
    ),
}

RESPONDER_CAPABILITIES: dict[str, dict] = {
    "medic": {
        "skills": {"CPR", "Trauma Care", "ALS", "Hemorrhage Control", "First Aid", "Assessment"},
        "equipment": {"Defibrillator", "First Aid Kit", "Stretcher", "O2 Tank", "IV Kit"},
    },
    "rescue": {
        "skills": {"Extrication", "Structural Assessment", "Rope Rescue", "Shoring",
                   "Water Rescue", "Boat Operation", "Swim Rescue", "First Aid", "Assessment"},
        "equipment": {"Hydraulic Cutters", "Rope", "Hard Hat", "Shoring Kit",
                      "Life Ring", "Inflatable Boat", "Life Jacket", "First Aid Kit"},
    },
    "fire": {
        "skills": {"Fire Suppression", "Hazmat", "Evacuation", "Search & Rescue",
                   "First Aid", "Assessment"},
        "equipment": {"Breathing Apparatus", "Fire Extinguisher", "Hose",
                      "Thermal Camera", "PPE", "First Aid Kit"},
    },
}


def get_profile(emergency_type: str) -> EmergencyProfile:
    return EMERGENCY_ONTOLOGY.get(emergency_type, EMERGENCY_ONTOLOGY["unknown"])


def capability_analysis(emergency_type: str, role: str) -> dict:
    """
    Returns what a responder role covers and what it misses for a given emergency type.
    Pure set operations — no LLM.
    """
    profile = get_profile(emergency_type)
    caps = RESPONDER_CAPABILITIES.get(role, {})

    required_skills = set(profile.skills)
    required_equip = set(profile.equipment)
    has_skills = caps.get("skills", set())
    has_equip = caps.get("equipment", set())

    skills_matched = sorted(required_skills & has_skills)
    skills_missing = sorted(required_skills - has_skills)
    equip_matched = sorted(required_equip & has_equip)
    equip_missing = sorted(required_equip - has_equip)

    coverage = len(skills_matched) / len(required_skills) if required_skills else 1.0

    return {
        "required_skills": sorted(required_skills),
        "required_equipment": sorted(required_equip),
        "skills_matched": skills_matched,
        "skills_missing": skills_missing,
        "equipment_matched": equip_matched,
        "equipment_missing": equip_missing,
        "skill_coverage": round(coverage, 2),
        "role_exact_match": role == profile.required_role,
        "role_compatible": role in profile.compatible_roles,
    }
