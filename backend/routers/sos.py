import uuid
import random
import string
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import SOSPacket, SOSStatus
from schemas import SOSCreate, SOSOut
from services.assignment import run_assignment

router = APIRouter()


def _gen_packet_code() -> str:
    return "PKT-" + "".join(random.choices(string.hexdigits[:16].upper(), k=4))


@router.post("/", response_model=SOSOut, status_code=201)
async def create_sos(
    body: SOSCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    sos = SOSPacket(
        id=uuid.uuid4(),
        victim_code=body.victim_code,
        packet_code=_gen_packet_code(),
        lat=body.lat,
        lng=body.lng,
        severity=body.severity,
        emergency_type=body.emergency_type,
        message=body.message,
        has_audio=body.has_audio,
        has_image=body.has_image,
        hops=body.hops,
        status=SOSStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    db.add(sos)
    await db.commit()
    await db.refresh(sos)

    # Run AI assignment in the background so we return immediately
    background_tasks.add_task(run_assignment, sos, db)

    return sos


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
    return sos
