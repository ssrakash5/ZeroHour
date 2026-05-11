import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import Responder, ResponderStatus
from schemas import ResponderCreate, ResponderOut, LocationUpdate
from services.pubsub import set_responder_location, get_all_live_locations, publish_location_update

router = APIRouter()


@router.post("/", response_model=ResponderOut, status_code=201)
async def register_responder(body: ResponderCreate, db: AsyncSession = Depends(get_db)):
    responder = Responder(
        id=uuid.uuid4(),
        code=body.code,
        name=body.name,
        role=body.role,
        sector=body.sector,
        lat=body.lat,
        lng=body.lng,
    )
    db.add(responder)
    await db.commit()
    await db.refresh(responder)
    return responder


@router.get("/", response_model=list[ResponderOut])
async def list_responders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Responder).order_by(Responder.code))
    return result.scalars().all()


@router.get("/{code}", response_model=ResponderOut)
async def get_responder(code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Responder).where(Responder.code == code))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Responder not found")
    return r


@router.post("/{code}/location")
async def update_location(
    code: str,
    body: LocationUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Heartbeat: responder app posts GPS every few seconds."""
    result = await db.execute(select(Responder).where(Responder.code == code))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Responder not found")

    r.lat = body.lat
    r.lng = body.lng
    r.last_seen = datetime.now(timezone.utc)
    if body.battery is not None:
        r.battery = body.battery

    await db.commit()

    # Store in Redis with TTL for real-time layer
    await set_responder_location(code, body.lat, body.lng, body.battery)
    await publish_location_update(code, body.lat, body.lng)

    return {"ok": True}


@router.get("/live/locations")
async def live_locations():
    """Returns all responder locations that have pinged in the last 30 s."""
    return await get_all_live_locations()


@router.patch("/{code}/status", response_model=ResponderOut)
async def set_status(
    code: str,
    status: ResponderStatus,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Responder).where(Responder.code == code))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Responder not found")
    r.status = status
    await db.commit()
    await db.refresh(r)
    return r
