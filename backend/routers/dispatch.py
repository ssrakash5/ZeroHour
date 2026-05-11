"""
Manual dispatch — supervisor overrides AI assignment.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from db.database import get_db
from db.models import SOSPacket, Responder, Assignment, SOSStatus, ResponderStatus, AssignmentStatus
from services.pubsub import publish_assignment

router = APIRouter()


class ManualDispatchBody(BaseModel):
    responder_code: str


@router.post("/{sos_id}/manual-dispatch")
async def manual_dispatch(
    sos_id: uuid.UUID,
    body: ManualDispatchBody,
    db: AsyncSession = Depends(get_db),
):
    """Supervisor manually assigns a responder — bypasses Gemma 4."""
    sos_result = await db.execute(select(SOSPacket).where(SOSPacket.id == sos_id))
    sos = sos_result.scalar_one_or_none()
    if not sos:
        raise HTTPException(404, "SOS not found")
    if sos.status == SOSStatus.resolved:
        raise HTTPException(400, "SOS already resolved")

    resp_result = await db.execute(
        select(Responder).where(Responder.code == body.responder_code)
    )
    responder = resp_result.scalar_one_or_none()
    if not responder:
        raise HTTPException(404, f"Responder {body.responder_code} not found")
    if responder.status == ResponderStatus.off_duty:
        raise HTTPException(400, "Responder is off duty")

    # Cancel any existing active assignment for this SOS
    existing = await db.execute(
        select(Assignment).where(
            Assignment.sos_id == sos_id,
            Assignment.status == AssignmentStatus.active,
        )
    )
    for old in existing.scalars().all():
        old.status = AssignmentStatus.cancelled

    assignment = Assignment(
        id=uuid.uuid4(),
        sos_id=sos.id,
        responder_id=responder.id,
        eta_minutes=None,
        distance_m=None,
        ai_reason="Manual dispatch by supervisor.",
        assigned_at=datetime.now(timezone.utc),
    )
    db.add(assignment)
    sos.status = SOSStatus.assigned
    responder.status = ResponderStatus.en_route
    await db.commit()
    await db.refresh(assignment)

    await publish_assignment(responder.code, {
        "assignment_id": str(assignment.id),
        "sos": {
            "id": str(sos.id),
            "victim_code": sos.victim_code,
            "severity": sos.severity.value,
            "emergency_type": sos.emergency_type.value,
            "message": sos.message,
            "lat": sos.lat,
            "lng": sos.lng,
        },
        "responder_code": responder.code,
        "responder_name": responder.name,
        "eta_minutes": None,
        "distance_m": None,
        "ai_reason": "Manual dispatch by supervisor.",
        "ai_available": False,
        "ai_override": True,
        "manual": True,
    })

    return {"ok": True, "assignment_id": str(assignment.id)}
