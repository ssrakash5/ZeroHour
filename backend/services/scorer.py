"""
Multi-factor responder scoring algorithm.
Runs entirely in Python before Gemma 4 is ever called.

Score breakdown (weights sum to 1.0):
  role_match    0.35  — exact role match is critical
  capability    0.25  — skill coverage for the emergency type
  distance      0.25  — closer is better, normalised over search radius
  battery       0.10  — avoid low-battery responders
  sector        0.05  — prefer responders who know the local area
"""
from __future__ import annotations
import math
from datetime import datetime, timezone

from services.ontology import get_profile, capability_analysis

SEARCH_RADIUS_M = 5_000

WEIGHTS = {
    "role_match":   0.35,
    "capability":   0.25,
    "distance":     0.25,
    "battery":      0.10,
    "sector":       0.05,
}

SEVERITY_BASE = {"critical": 1.0, "urgent": 0.7, "low": 0.4}


# ── Individual factor calculators ─────────────────────────────────────────────

def _role_score(emergency_type: str, role: str) -> float:
    profile = get_profile(emergency_type)
    if role == profile.required_role:
        return 1.0
    if role in profile.compatible_roles:
        return 0.55
    return 0.10


def _distance_score(distance_m: float) -> float:
    """Inverse linear, clamped to search radius."""
    return max(0.0, 1.0 - distance_m / SEARCH_RADIUS_M)


def _battery_score(battery: int) -> float:
    if battery >= 50:
        return 1.0
    if battery >= 20:
        return 0.5
    return 0.1   # heavily penalise, still dispatachable in extremis


def _sector_score(sos_sector: int | None, responder_sector: int) -> float:
    if sos_sector is None:
        return 0.5
    return 1.0 if sos_sector == responder_sector else 0.6


def _urgency_multiplier(severity: str, created_at: datetime) -> float:
    """
    Time-decay urgency: the longer an SOS waits unattended,
    the higher its effective priority multiplier.
    """
    base = SEVERITY_BASE.get(severity, 0.5)
    elapsed_min = (datetime.now(timezone.utc) - created_at).total_seconds() / 60
    profile = get_profile("unknown")  # use generic decay
    decay = min(elapsed_min / profile.max_response_min, 1.5)
    return round(base + 0.3 * decay, 3)


# ── Main scoring function ─────────────────────────────────────────────────────

def score_candidate(
    emergency_type: str,
    severity: str,
    sos_sector: int | None,
    created_at: datetime,
    candidate: dict,
) -> dict:
    """
    Returns the candidate dict enriched with:
      - composite_score (0–1)
      - score_breakdown (per-factor)
      - ontology (capability analysis)
      - urgency_multiplier
    """
    role = candidate["role"]
    distance_m = candidate["distance_m"]
    battery = candidate.get("battery", 100)
    sector = candidate.get("sector", 0)

    factors = {
        "role_match":   _role_score(emergency_type, role),
        "capability":   capability_analysis(emergency_type, role)["skill_coverage"],
        "distance":     _distance_score(distance_m),
        "battery":      _battery_score(battery),
        "sector":       _sector_score(sos_sector, sector),
    }

    composite = sum(WEIGHTS[k] * v for k, v in factors.items())
    urgency = _urgency_multiplier(severity, created_at)

    ontology = capability_analysis(emergency_type, role)

    return {
        **candidate,
        "composite_score":    round(composite, 3),
        "score_breakdown":    {k: round(v, 3) for k, v in factors.items()},
        "urgency_multiplier": urgency,
        "ontology":           ontology,
    }


def rank_candidates(
    emergency_type: str,
    severity: str,
    sos_sector: int | None,
    created_at: datetime,
    candidates: list[dict],
    top_n: int = 5,
) -> list[dict]:
    """
    Score and rank all candidates. Returns top N sorted by composite score desc.
    Ties broken by distance ascending.
    """
    scored = [
        score_candidate(emergency_type, severity, sos_sector, created_at, c)
        for c in candidates
    ]
    scored.sort(key=lambda c: (-c["composite_score"], c["distance_m"]))
    return scored[:top_n]


def detect_hotspots(sos_list: list[dict], radius_m: float = 500.0) -> list[dict]:
    """
    Simple distance-based spatial clustering.
    Groups SOS packets within `radius_m` of each other.
    Returns a list of hotspot dicts with centroid + member ids.
    """
    from services.geo import GeoPoint, haversine_m

    clusters: list[list[dict]] = []
    assigned = set()

    for i, a in enumerate(sos_list):
        if i in assigned:
            continue
        group = [a]
        assigned.add(i)
        for j, b in enumerate(sos_list):
            if j in assigned:
                continue
            dist = haversine_m(
                GeoPoint(a["lat"], a["lng"]),
                GeoPoint(b["lat"], b["lng"]),
            )
            if dist <= radius_m:
                group.append(b)
                assigned.add(j)
        clusters.append(group)

    hotspots = []
    for group in clusters:
        if len(group) < 2:
            continue
        lat = sum(g["lat"] for g in group) / len(group)
        lng = sum(g["lng"] for g in group) / len(group)
        severities = [g["severity"] for g in group]
        hotspots.append({
            "centroid_lat": round(lat, 6),
            "centroid_lng": round(lng, 6),
            "count": len(group),
            "ids": [g["id"] for g in group],
            "highest_severity": "critical" if "critical" in severities else "urgent" if "urgent" in severities else "low",
        })

    return hotspots
