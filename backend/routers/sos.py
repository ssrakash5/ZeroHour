import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import Assignment, EmergencyType, Responder, ResponderStatus, SOSPacket, SOSStatus, Severity
from schemas import SOSCreate, SOSOut, SOSWithAssignment
from services.assignment import run_assignment_in_session
from services.pubsub import publish
from services.geo import GeoPoint, haversine_m
from services.gemma import triage_packet

router = APIRouter()

DEDUP_RADIUS_M = 30
DEDUP_LOOKBACK_HOURS = 12
SEVERITY_RANK = {"low": 1, "urgent": 2, "critical": 3}


def _gen_packet_code() -> str:
    return "PKT-" + "".join(random.choices(string.hexdigits[:16].upper(), k=4))


async def _find_coordinate_duplicate(
    body: SOSCreate,
    db: AsyncSession,
) -> tuple[SOSPacket | None, int | None]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DEDUP_LOOKBACK_HOURS)
    result = await db.execute(
        select(SOSPacket)
        .where(SOSPacket.status.in_([SOSStatus.pending, SOSStatus.assigned]))
        .where(SOSPacket.created_at >= cutoff)
        .order_by(SOSPacket.created_at.desc())
    )

    incoming = GeoPoint(lat=body.lat, lng=body.lng)
    for existing in result.scalars().all():
        distance_m = haversine_m(incoming, GeoPoint(lat=existing.lat, lng=existing.lng))
        if distance_m <= DEDUP_RADIUS_M:
            return existing, round(distance_m)

    return None, None


def _coerce_severity(value: str | None) -> Severity:
    try:
        return Severity(value or Severity.urgent.value)
    except ValueError:
        return Severity.urgent


def _coerce_emergency_type(value: str | None) -> EmergencyType:
    try:
        return EmergencyType(value or EmergencyType.unknown.value)
    except ValueError:
        return EmergencyType.unknown


def _triage_request_dict(body: SOSCreate) -> dict:
    return {
        "victim_code": body.victim_code,
        "message": body.message,
        "has_audio": body.has_audio,
        "has_image": body.has_image,
        "audio_base64": body.audio_base64,
        "submitted_severity": body.severity.value if body.severity else None,
        "submitted_emergency_type": body.emergency_type.value if body.emergency_type else None,
    }


import json

def _enrich_message(base_message: str | None, triage: dict) -> str:
    message = base_message or ""
    
    # Store structured data cleanly
    structured_data = {
        "voice_transcript": triage.get("voice_transcript"),
        "people_count": triage.get("people_count"),
        "reason": triage.get("reason"),
        "calamity": triage.get("calamity"),
        "age": triage.get("age"),
        "medical_conditions": triage.get("medical_conditions"),
        "quick_needs": triage.get("quick_needs")
    }
    
    # Only append if we have actual data
    if any(structured_data.values()):
        return f"{message}\n\n---STRUCTURED_DATA---\n{json.dumps(structured_data)}"
    
    return message


def _merge_duplicate_report(
    existing: SOSPacket,
    body: SOSCreate,
    triage: dict,
    distance_m: int | None,
) -> None:
    incoming_severity = _coerce_severity(triage.get("severity"))
    incoming_type = _coerce_emergency_type(triage.get("emergency_type"))

    if SEVERITY_RANK[incoming_severity.value] > SEVERITY_RANK[existing.severity.value]:
        existing.severity = incoming_severity

    if existing.emergency_type == EmergencyType.unknown and incoming_type != EmergencyType.unknown:
        existing.emergency_type = incoming_type

    existing.has_audio = existing.has_audio or body.has_audio
    existing.has_image = existing.has_image or body.has_image
    existing.hops = max(existing.hops, body.hops)
    existing.model_score = max(existing.model_score or 0.0, triage.get("confidence") or 0.0)

    enriched_incoming_message = _enrich_message(body.message, triage)
    if enriched_incoming_message and enriched_incoming_message not in (existing.message or ""):
        distance_label = f"{distance_m} m" if distance_m is not None else "nearby"
        addition = f"\n\nAdditional report from same coordinate cluster ({distance_label}):\n{enriched_incoming_message}"
        existing.message = f"{existing.message or ''}{addition}".strip()


async def _assignment_out(sos_id: uuid.UUID, db: AsyncSession) -> dict | None:
    assign_result = await db.execute(
        select(Assignment)
        .where(Assignment.sos_id == sos_id)
        .order_by(Assignment.assigned_at.desc())
    )
    assignment = assign_result.scalars().first()
    if not assignment:
        return None

    resp_result = await db.execute(
        select(Responder).where(Responder.id == assignment.responder_id)
    )
    responder = resp_result.scalar_one_or_none()

    return {
        "id": str(assignment.id),
        "responder_code": responder.code if responder else None,
        "responder_name": responder.name if responder else None,
        "responder_role": responder.role.value if responder else None,
        "responder_sector": responder.sector if responder else None,
        "eta_minutes": assignment.eta_minutes,
        "distance_m": assignment.distance_m,
        "ai_reason": assignment.ai_reason,
        "ai_available": getattr(assignment, "ai_available", None),
        "confidence": getattr(assignment, "confidence", None),
    }


@router.post("/", response_model=SOSWithAssignment, status_code=201)
async def create_sos(body: SOSCreate, db: AsyncSession = Depends(get_db)):
    if body.device_triage:
        triage = body.device_triage
        triage.setdefault("severity", "urgent")
        triage.setdefault("emergency_type", "unknown")
        triage.setdefault("reason", "On-device AI triage")
        triage.setdefault("confidence", 0.8)
        triage.setdefault("ai_available", True)
    else:
        triage = await triage_packet(_triage_request_dict(body))
    severity = _coerce_severity(triage.get("severity"))
    emergency_type = _coerce_emergency_type(triage.get("emergency_type"))
    enriched_message = _enrich_message(body.message, triage)

    duplicate, distance_m = await _find_coordinate_duplicate(body, db)
    if duplicate:
        _merge_duplicate_report(duplicate, body, triage, distance_m)
        await db.commit()
        await db.refresh(duplicate)

        assignment_out = await _assignment_out(duplicate.id, db)
        if duplicate.status == SOSStatus.pending and assignment_out is None:
            assignment = await run_assignment_in_session(duplicate.id, db, triage_result=triage)
            if assignment:
                assignment_out = await _assignment_out(duplicate.id, db)
                if assignment_out:
                    assignment_out["ai_available"] = getattr(assignment, "ai_available", None)
                    assignment_out["confidence"] = getattr(assignment, "confidence", None)

        return {"sos": duplicate, "assignment": assignment_out, "triage": triage}

    sos = SOSPacket(
        id=uuid.uuid4(),
        victim_code=body.victim_code,
        packet_code=_gen_packet_code(),
        lat=body.lat,
        lng=body.lng,
        severity=severity,
        emergency_type=emergency_type,
        message=enriched_message,
        model_score=triage.get("confidence"),
        has_audio=body.has_audio,
        has_image=body.has_image,
        hops=body.hops,
        status=SOSStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    db.add(sos)
    await db.commit()
    await db.refresh(sos)

    assignment = await run_assignment_in_session(sos.id, db, triage_result=triage)
    await db.refresh(sos)

    assignment_out = await _assignment_out(sos.id, db) if assignment else None
    if assignment and assignment_out:
        assignment_out["ai_available"] = getattr(assignment, "ai_available", None)
        assignment_out["confidence"] = getattr(assignment, "confidence", None)

    return {"sos": sos, "assignment": assignment_out, "triage": triage}


@router.post("/reset-demo")
async def reset_demo(db: AsyncSession = Depends(get_db)):
    assign_result = await db.execute(select(Assignment))
    for assignment in assign_result.scalars().all():
        await db.delete(assignment)

    sos_result = await db.execute(select(SOSPacket))
    for sos in sos_result.scalars().all():
        await db.delete(sos)

    responder_result = await db.execute(select(Responder))
    for responder in responder_result.scalars().all():
        responder.status = ResponderStatus.available

    await db.commit()
    return {"ok": True}


@router.get("/queue", response_model=list[SOSOut])
async def get_queue(
    status: SOSStatus | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(SOSPacket).order_by(SOSPacket.created_at.desc())
    if status:
        q = q.where(SOSPacket.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/assignments/recent")
async def get_recent_assignments(limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .options(selectinload(Assignment.sos), selectinload(Assignment.responder))
        .order_by(Assignment.assigned_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    out = []
    for a in rows:
        sos = a.sos
        r = a.responder
        out.append({
            "assignment_id": str(a.id),
            "sos": {
                "id": str(sos.id),
                "victim_code": sos.victim_code,
                "packet_code": sos.packet_code,
                "lat": sos.lat,
                "lng": sos.lng,
                "severity": sos.severity.value,
                "emergency_type": sos.emergency_type.value,
                "message": sos.message,
                "status": sos.status.value,
                "created_at": sos.created_at.isoformat(),
            },
            "responder_code": r.code if r else None,
            "responder_name": r.name if r else None,
            "eta_minutes": a.eta_minutes,
            "distance_m": a.distance_m,
            "ai_reason": a.ai_reason,
            "ai_available": a.ai_reason is not None,
            "ts": a.assigned_at.timestamp() * 1000,
        })
    return out


@router.get("/{sos_id}", response_model=SOSOut)
async def get_sos(sos_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SOSPacket).where(SOSPacket.id == sos_id))
    sos = result.scalar_one_or_none()
    if not sos:
        raise HTTPException(404, "SOS not found")
    return sos


@router.patch("/{sos_id}/resolve", response_model=SOSOut)
async def resolve_sos(sos_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SOSPacket).where(SOSPacket.id == sos_id))
    sos = result.scalar_one_or_none()
    if not sos:
        raise HTTPException(404, "SOS not found")
    sos.status = SOSStatus.resolved
    await db.commit()
    await db.refresh(sos)
    await publish("supervisor", "sos:resolved", {"id": str(sos.id)})
    return sos
