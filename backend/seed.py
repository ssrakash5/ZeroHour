"""Seed demo responders on first startup."""
import uuid
from sqlalchemy import select
from db.database import SessionLocal
from db.models import Responder, ResponderRole, ResponderStatus

DEMO_RESPONDERS = [
    {"code": "R-114", "name": "A. Kumar",  "role": ResponderRole.medic,   "sector": 14, "lat": 9.9312, "lng": 76.2673},  # Kochi hub
    {"code": "R-118", "name": "S. Mehta",  "role": ResponderRole.medic,   "sector": 14, "lat": 9.9420, "lng": 76.2750},  # north Ernakulam
    {"code": "R-205", "name": "D. Rao",    "role": ResponderRole.rescue,  "sector": 14, "lat": 9.9180, "lng": 76.2590},  # south Ernakulam
    {"code": "R-312", "name": "P. Singh",  "role": ResponderRole.fire,    "sector": 15, "lat": 9.9550, "lng": 76.2980},  # near Aluva
    {"code": "R-401", "name": "M. Sharma", "role": ResponderRole.rescue,  "sector": 15, "lat": 9.9280, "lng": 76.3100},  # toward Perumbavoor
]


async def seed_responders():
    async with SessionLocal() as db:
        result = await db.execute(select(Responder))
        existing = {responder.code: responder for responder in result.scalars().all()}

        for data in DEMO_RESPONDERS:
            responder = existing.get(data["code"])
            if responder:
                responder.name = data["name"]
                responder.role = data["role"]
                responder.sector = data["sector"]
                responder.lat = data["lat"]
                responder.lng = data["lng"]
                responder.battery = 100
                responder.status = ResponderStatus.available
                continue

            db.add(Responder(
                id=uuid.uuid4(),
                code=data["code"],
                name=data["name"],
                role=data["role"],
                sector=data["sector"],
                lat=data["lat"],
                lng=data["lng"],
                battery=100,
                status=ResponderStatus.available,
            ))
        await db.commit()
        print(f"[seed] Ready with {len(DEMO_RESPONDERS)} demo responders.")
