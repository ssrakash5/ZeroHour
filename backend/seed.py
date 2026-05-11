"""Seed demo responders on first startup."""
import uuid
from sqlalchemy import select
from db.database import SessionLocal
from db.models import Responder, ResponderRole, ResponderStatus

DEMO_RESPONDERS = [
    {"code": "R-114", "name": "A. Kumar",  "role": ResponderRole.medic,   "sector": 14, "lat": 28.6280, "lng": 77.2100},
    {"code": "R-118", "name": "S. Mehta",  "role": ResponderRole.medic,   "sector": 14, "lat": 28.6320, "lng": 77.2050},
    {"code": "R-205", "name": "D. Rao",    "role": ResponderRole.rescue,  "sector": 14, "lat": 28.6200, "lng": 77.2200},
    {"code": "R-312", "name": "P. Singh",  "role": ResponderRole.fire,    "sector": 15, "lat": 28.6350, "lng": 77.1950},
    {"code": "R-401", "name": "M. Sharma", "role": ResponderRole.rescue,  "sector": 15, "lat": 28.6150, "lng": 77.2300},
]


async def seed_responders():
    async with SessionLocal() as db:
        result = await db.execute(select(Responder).limit(1))
        if result.scalar_one_or_none():
            return  # already seeded

        for data in DEMO_RESPONDERS:
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
        print(f"[seed] Inserted {len(DEMO_RESPONDERS)} demo responders.")
