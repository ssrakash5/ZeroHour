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
from db.models import Responder, SOSPacket, Assignment, SOSStatus, ResponderStatus, AssignmentStatus
from services.geo import GeoPoint, haversine_m, eta_minutes
from services.scorer import rank_candidates
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

    # Guard: never double-assign the same SOS
    if sos.status == SOSStatus.assigned:
        existing = await db.execute(
            select(Assignment).where(
                Assignment.sos_id == sos_id,
                Assignment.status == AssignmentStatus.active,
            )
        )
        return existing.scalar_one_or_none()

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

    # ── Resolve team members (if Gemma requested team dispatch) ──────────────
    team_codes = ai_result.get("team_codes", [])
    if team_codes:
        # Deduplicate and exclude codes not in ranked list
        ranked_codes = {c["code"] for c in ranked}
        team_codes = list(dict.fromkeys(c for c in team_codes if c in ranked_codes))
    if not team_codes:
        team_codes = [chosen["code"]]

    team_candidates = [next((c for c in ranked if c["code"] == tc), None) for tc in team_codes]
    team_candidates = [c for c in team_candidates if c is not None]

    # ── Load responder ORM objects for all team members ───────────────────────
    team_responders = []
    for tc in team_candidates:
        r_result = await db.execute(select(Responder).where(Responder.code == tc["code"]))
        r = r_result.scalar_one_or_none()
        if r:
            team_responders.append((tc, r))

    if not team_responders:
        return None

    # ── Persist one Assignment per team member ────────────────────────────────
    assignments = []
    for cand, resp in team_responders:
        a = Assignment(
            id=uuid.uuid4(),
            sos_id=sos.id,
            responder_id=resp.id,
            eta_minutes=ai_result.get("eta_minutes", cand["eta_minutes"]),
            distance_m=round(cand["distance_m"]),
            ai_reason=ai_result.get("reason"),
            assigned_at=datetime.now(timezone.utc),
        )
        db.add(a)
        resp.status = ResponderStatus.en_route
        assignments.append((a, cand, resp))

    sos.status = SOSStatus.assigned
    await db.commit()
    for a, _, _ in assignments:
        await db.refresh(a)

    # ── Publish combined team event ───────────────────────────────────────────
    primary_assignment, primary_cand, primary_resp = assignments[0]
    onto = primary_cand.get("ontology", {})
    team_members = [
        {"responder_code": resp.code, "responder_name": resp.name, "role": resp.role.value,
         "eta_minutes": a.eta_minutes, "distance_m": a.distance_m}
        for a, _, resp in assignments
    ]
    is_team = len(assignments) > 1

    await publish_assignment(primary_resp.code, {
        "assignment_id": str(primary_assignment.id),
        "sos": _sos_dict(sos),
        "responder_code": primary_resp.code,
        "responder_name": primary_resp.name,
        "eta_minutes": primary_assignment.eta_minutes,
        "distance_m": primary_assignment.distance_m,
        "ai_reason": ai_result.get("reason"),
        "ai_available": ai_result.get("ai_available", False),
        "ai_override": ai_result.get("override", False),
        "confidence": ai_result.get("confidence"),
        "is_team": is_team,
        "team_reason": ai_result.get("team_reason") if is_team else None,
        "team": team_members,
        "composite_score": primary_cand.get("composite_score"),
        "score_breakdown": primary_cand.get("score_breakdown"),
        "urgency_multiplier": primary_cand.get("urgency_multiplier"),
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

    return primary_assignment


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
