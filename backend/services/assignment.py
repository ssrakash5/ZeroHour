"""
Assignment engine:
  1. Backend triage sets final emergency type and criticality.
  2. Algorithmic scorer ranks nearby responders.
  3. Gemma 4 confirms or overrides the responder choice.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import SessionLocal
from db.models import Assignment, Responder, ResponderStatus, SOSPacket, SOSStatus
from services.gemma import triage_and_assign
from services.geo import GeoPoint, eta_minutes, haversine_m
from services.pubsub import publish_assignment, publish_sos_new
from services.scorer import rank_candidates

SEARCH_RADIUS_M = 5_000


async def run_assignment(sos_id: uuid.UUID, triage_result: dict | None = None) -> Assignment | None:
    async with SessionLocal() as db:
        return await _assign(sos_id, db, triage_result=triage_result)


async def run_assignment_in_session(
    sos_id: uuid.UUID,
    db: AsyncSession,
    triage_result: dict | None = None,
) -> Assignment | None:
    return await _assign(sos_id, db, triage_result=triage_result)


def _combined_reason(triage_result: dict | None, dispatch_reason: str | None) -> str | None:
    parts = []
    if triage_result:
        severity = triage_result.get("severity")
        emergency_type = triage_result.get("emergency_type")
        triage_reason = triage_result.get("reason")
        triage_line = f"Triage set {severity} / {emergency_type}"
        if triage_reason:
            triage_line += f": {triage_reason}"
        parts.append(triage_line)
    if dispatch_reason:
        parts.append(f"Dispatch: {dispatch_reason}")
    return " ".join(parts) if parts else None


async def _assign(sos_id: uuid.UUID, db: AsyncSession, triage_result: dict | None = None) -> Assignment | None:
    result = await db.execute(select(SOSPacket).where(SOSPacket.id == sos_id))
    sos = result.scalar_one_or_none()
    if not sos:
        return None

    await publish_sos_new(_sos_dict(sos))

    resp_result = await db.execute(
        select(Responder).where(Responder.status == ResponderStatus.available)
    )
    responders = resp_result.scalars().all()
    if not responders:
        return None

    sos_point = GeoPoint(lat=sos.lat, lng=sos.lng)
    raw_candidates = []
    for responder in responders:
        if responder.lat is None or responder.lng is None:
            continue
        dist = haversine_m(sos_point, GeoPoint(lat=responder.lat, lng=responder.lng))
        if dist > SEARCH_RADIUS_M:
            continue
        raw_candidates.append({
            "id": str(responder.id),
            "code": responder.code,
            "name": responder.name,
            "role": responder.role.value,
            "sector": responder.sector,
            "status": responder.status.value,
            "battery": responder.battery,
            "distance_m": dist,
            "eta_minutes": eta_minutes(dist, responder.role.value),
        })

    if not raw_candidates:
        return None

    ranked = rank_candidates(
        emergency_type=sos.emergency_type.value,
        severity=sos.severity.value,
        sos_sector=None,
        created_at=sos.created_at,
        candidates=raw_candidates,
    )

    sos_payload = _sos_dict(sos)
    if triage_result:
        sos_payload["triage_reason"] = triage_result.get("reason")
        sos_payload["triage_confidence"] = triage_result.get("confidence")
        sos_payload["triage_ai_available"] = triage_result.get("ai_available")

    ai_result = await triage_and_assign(sos_payload, ranked)
    assigned_code = ai_result.get("assign")
    if not assigned_code:
        return None

    chosen = next((candidate for candidate in ranked if candidate["code"] == assigned_code), ranked[0])

    resp_result2 = await db.execute(
        select(Responder).where(Responder.code == chosen["code"])
    )
    responder = resp_result2.scalar_one_or_none()
    if not responder:
        return None

    assignment = Assignment(
        id=uuid.uuid4(),
        sos_id=sos.id,
        responder_id=responder.id,
        eta_minutes=ai_result.get("eta_minutes", chosen["eta_minutes"]),
        distance_m=round(chosen["distance_m"]),
        ai_reason=_combined_reason(triage_result, ai_result.get("reason")),
        assigned_at=datetime.now(timezone.utc),
    )
    assignment.ai_available = ai_result.get("ai_available", False)
    assignment.confidence = ai_result.get("confidence")
    db.add(assignment)
    sos.status = SOSStatus.assigned
    responder.status = ResponderStatus.en_route
    await db.commit()
    await db.refresh(assignment)

    onto = chosen.get("ontology", {})
    await publish_assignment(responder.code, {
        "assignment_id": str(assignment.id),
        "sos": _sos_dict(sos),
        "responder_code": responder.code,
        "responder_name": responder.name,
        "eta_minutes": assignment.eta_minutes,
        "distance_m": assignment.distance_m,
        "ai_reason": assignment.ai_reason,
        "ai_available": assignment.ai_available,
        "ai_override": ai_result.get("override", False),
        "confidence": assignment.confidence,
        "triage": triage_result,
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
