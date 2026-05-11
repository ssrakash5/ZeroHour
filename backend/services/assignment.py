"""
Core assignment engine:
  1. Receive an SOSPacket
  2. Query available responders from DB
  3. Compute distances via Haversine
  4. Ask Gemma 4 to pick the best one
  5. Persist the Assignment to Postgres
  6. Publish via Redis → WebSocket
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Responder, SOSPacket, Assignment, SOSStatus, ResponderStatus
from services.geo import GeoPoint, haversine_m, eta_minutes
from services.gemma import triage_and_assign
from services.pubsub import publish_assignment, publish_sos_new

SEARCH_RADIUS_M = 5_000   # consider responders within 5 km
MAX_CANDIDATES = 5


async def run_assignment(sos: SOSPacket, db: AsyncSession) -> Assignment | None:
    # Broadcast new SOS to supervisor dashboard immediately
    await publish_sos_new(_sos_dict(sos))

    # Pull available responders
    result = await db.execute(
        select(Responder).where(Responder.status == ResponderStatus.available)
    )
    responders = result.scalars().all()

    if not responders:
        return None

    sos_point = GeoPoint(lat=sos.lat, lng=sos.lng)

    # Compute distances and filter by radius
    candidates = []
    for r in responders:
        if r.lat is None or r.lng is None:
            continue
        dist = haversine_m(sos_point, GeoPoint(lat=r.lat, lng=r.lng))
        if dist <= SEARCH_RADIUS_M:
            candidates.append({
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

    if not candidates:
        return None

    # Sort by distance, cap candidates
    candidates.sort(key=lambda c: c["distance_m"])
    top = candidates[:MAX_CANDIDATES]

    # Ask Gemma 4
    ai_result = await triage_and_assign(_sos_dict(sos), top)

    assigned_code = ai_result.get("assign")
    if not assigned_code:
        return None

    # Find the responder object
    chosen = next((c for c in top if c["code"] == assigned_code), top[0])
    resp_result = await db.execute(
        select(Responder).where(Responder.code == chosen["code"])
    )
    responder = resp_result.scalar_one_or_none()
    if not responder:
        return None

    # Persist assignment
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

    # Mark SOS as assigned, responder as en_route
    sos.status = SOSStatus.assigned
    responder.status = ResponderStatus.en_route

    await db.commit()
    await db.refresh(assignment)

    # Push to responder's WebSocket channel and supervisor
    await publish_assignment(responder.code, {
        "assignment_id": str(assignment.id),
        "sos": _sos_dict(sos),
        "responder_code": responder.code,
        "responder_name": responder.name,
        "eta_minutes": assignment.eta_minutes,
        "distance_m": assignment.distance_m,
        "ai_reason": assignment.ai_reason,
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
