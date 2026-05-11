"""
Assignment engine — two-layer pipeline:
  1. Algorithmic layer  (scorer.py + ontology.py) — fast, deterministic
  2. Gemma 4 layer      (gemma.py)                — contextual, final decision
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import SessionLocal
from db.models import Responder, SOSPacket, Assignment, SOSStatus, ResponderStatus
from services.geo import GeoPoint, haversine_m, eta_minutes
from services.scorer import rank_candidates
from services.gemma import triage_and_assign
from services.pubsub import publish_assignment, publish_sos_new

SEARCH_RADIUS_M = 5_000


async def run_assignment(sos_id: uuid.UUID) -> Assignment | None:
    """Entry point for background tasks — opens its own session."""
    async with SessionLocal() as db:
        return await _assign(sos_id, db)


async def run_assignment_in_session(sos_id: uuid.UUID, db: AsyncSession) -> Assignment | None:
    """Entry point when caller already holds a session (inline request path)."""
    return await _assign(sos_id, db)


async def _assign(sos_id: uuid.UUID, db: AsyncSession) -> Assignment | None:
    # ── Load SOS ──────────────────────────────────────────────────────────────
    result = await db.execute(select(SOSPacket).where(SOSPacket.id == sos_id))
    sos = result.scalar_one_or_none()
    if not sos:
        return None

    await publish_sos_new(_sos_dict(sos))

    # ── Load available responders ─────────────────────────────────────────────
    resp_result = await db.execute(
        select(Responder).where(Responder.status == ResponderStatus.available)
    )
    responders = resp_result.scalars().all()
    if not responders:
        return None

    sos_point = GeoPoint(lat=sos.lat, lng=sos.lng)

    # ── Build raw candidate list with distances ───────────────────────────────
    raw_candidates = []
    for r in responders:
        if r.lat is None or r.lng is None:
            continue
        dist = haversine_m(sos_point, GeoPoint(lat=r.lat, lng=r.lng))
        if dist > SEARCH_RADIUS_M:
            continue
        raw_candidates.append({
            "id": str(r.id),
            "code": r.code,
            "name": r.name,
            "role": r.role.value,
            "sector": r.sector,
            "status": r.status.value,
            "battery": r.battery,
            "distance_m": dist,
            "eta_minutes": eta_minutes(dist, r.role.value),
        })

    if not raw_candidates:
        return None

    # ── Layer 1: algorithmic scoring + ontology analysis ─────────────────────
    ranked = rank_candidates(
        emergency_type=sos.emergency_type.value,
        severity=sos.severity.value,
        sos_sector=None,        # extend: derive sector from lat/lng
        created_at=sos.created_at,
        candidates=raw_candidates,
    )

    # ── Layer 2: Gemma 4 final decision ───────────────────────────────────────
    ai_result = await triage_and_assign(_sos_dict(sos), ranked)

    assigned_code = ai_result.get("assign")
    if not assigned_code:
        return None

    # Gemma may pick any from the ranked list; fall back to algo top if unknown
    chosen = next((c for c in ranked if c["code"] == assigned_code), ranked[0])

    resp_result2 = await db.execute(
        select(Responder).where(Responder.code == chosen["code"])
    )
    responder = resp_result2.scalar_one_or_none()
    if not responder:
        return None

    # ── Persist assignment ────────────────────────────────────────────────────
    assignment = Assignment(
        id=uuid.uuid4(),
        sos_id=sos.id,
        responder_id=responder.id,
        eta_minutes=ai_result.get("eta_minutes", chosen["eta_minutes"]),
        distance_m=round(chosen["distance_m"]),
        ai_reason=ai_result.get("reason"),
        assigned_at=datetime.now(timezone.utc),
    )
    db.add(assignment)
    sos.status = SOSStatus.assigned
    responder.status = ResponderStatus.en_route
    await db.commit()
    await db.refresh(assignment)

    # ── Publish to WebSocket channels ────────────────────────────────────────
    onto = chosen.get("ontology", {})
    await publish_assignment(responder.code, {
        "assignment_id": str(assignment.id),
        "sos": _sos_dict(sos),
        "responder_code": responder.code,
        "responder_name": responder.name,
        "eta_minutes": assignment.eta_minutes,
        "distance_m": assignment.distance_m,
        "ai_reason": assignment.ai_reason,
        "ai_available": ai_result.get("ai_available", False),
        "ai_override": ai_result.get("override", False),
        "confidence": ai_result.get("confidence"),
        # Algorithm layer results — shown in supervisor ontology panel
        "composite_score": chosen.get("composite_score"),
        "score_breakdown": chosen.get("score_breakdown"),
        "urgency_multiplier": chosen.get("urgency_multiplier"),
        "ontology": {
            "required_skills": onto.get("required_skills", []),
            "required_equipment": onto.get("required_equipment", []),
            "skills_matched": onto.get("skills_matched", []),
            "skills_missing": onto.get("skills_missing", []),
            "equipment_matched": onto.get("equipment_matched", []),
            "equipment_missing": onto.get("equipment_missing", []),
            "skill_coverage": onto.get("skill_coverage", 0),
            "role_exact_match": onto.get("role_exact_match", False),
        },
    })

    return assignment


def _sos_dict(sos: SOSPacket) -> dict:
    return {
        "id": str(sos.id),
        "victim_code": sos.victim_code,
        "packet_code": sos.packet_code,
        "lat": sos.lat,
        "lng": sos.lng,
        "severity": sos.severity.value,
        "emergency_type": sos.emergency_type.value,
        "message": sos.message,
        "model_score": sos.model_score,
        "has_audio": sos.has_audio,
        "has_image": sos.has_image,
        "hops": sos.hops,
        "status": sos.status.value,
        "created_at": sos.created_at.isoformat(),
    }
