"""
Read-only endpoints that expose the algorithmic layer to the frontend.
No LLM involved — pure knowledge base + scorer queries.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import SOSPacket, SOSStatus
from services.ontology import get_profile, capability_analysis, EMERGENCY_ONTOLOGY
from services.scorer import detect_hotspots

router = APIRouter()


@router.get("/profile/{emergency_type}")
async def emergency_profile(emergency_type: str):
    """Return the full ontology profile for an emergency type."""
    profile = get_profile(emergency_type)
    return {
        "emergency_type": emergency_type,
        "required_role": profile.required_role,
        "compatible_roles": list(profile.compatible_roles),
        "skills": list(profile.skills),
        "equipment": list(profile.equipment),
        "severity_weight": profile.severity_weight,
        "max_response_min": profile.max_response_min,
    }


@router.get("/capability/{emergency_type}/{role}")
async def role_capability(emergency_type: str, role: str):
    """Return what a role covers and misses for a given emergency type."""
    return capability_analysis(emergency_type, role)


@router.get("/types")
async def all_types():
    """List all known emergency types with their required roles."""
    return [
        {
            "type": k,
            "required_role": v.required_role,
            "compatible_roles": list(v.compatible_roles),
            "max_response_min": v.max_response_min,
        }
        for k, v in EMERGENCY_ONTOLOGY.items()
    ]


@router.get("/hotspots")
async def hotspots(
    radius_m: float = Query(500.0, ge=100, le=5000),
    db: AsyncSession = Depends(get_db),
):
    """Cluster active SOS packets spatially and return hotspot zones."""
    result = await db.execute(
        select(SOSPacket).where(SOSPacket.status == SOSStatus.pending)
    )
    active = result.scalars().all()

    sos_list = [
        {"id": str(s.id), "lat": s.lat, "lng": s.lng, "severity": s.severity.value}
        for s in active
    ]

    return {"hotspots": detect_hotspots(sos_list, radius_m), "total_active": len(sos_list)}
