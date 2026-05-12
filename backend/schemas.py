from __future__ import annotations
import uuid
from datetime import datetime
from pydantic import BaseModel
from db.models import Severity, EmergencyType, SOSStatus, ResponderRole, ResponderStatus, AssignmentStatus


# ── SOS ──────────────────────────────────────────────────────────────────────

class SOSCreate(BaseModel):
    victim_code: str
    lat: float
    lng: float
    severity: Severity | None = None
    emergency_type: EmergencyType | None = None
    message: str | None = None
    has_audio: bool = False
    has_image: bool = False
    hops: int = 0


class SOSOut(BaseModel):
    id: uuid.UUID
    victim_code: str
    packet_code: str
    lat: float
    lng: float
    severity: Severity
    emergency_type: EmergencyType
    message: str | None
    model_score: float | None
    has_audio: bool
    has_image: bool
    hops: int
    status: SOSStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentBrief(BaseModel):
    id: str
    responder_code: str | None
    responder_name: str | None
    responder_role: str | None
    responder_sector: int | None
    eta_minutes: int | None
    distance_m: int | None
    ai_reason: str | None
    ai_available: bool | None = None
    confidence: float | None = None


class TriageBrief(BaseModel):
    severity: str
    emergency_type: str
    reason: str | None = None
    confidence: float | None = None
    ai_available: bool | None = None


class SOSWithAssignment(BaseModel):
    sos: SOSOut
    assignment: AssignmentBrief | None
    triage: TriageBrief | None = None


# ── Responder ─────────────────────────────────────────────────────────────────

class ResponderCreate(BaseModel):
    code: str
    name: str
    role: ResponderRole
    sector: int
    lat: float | None = None
    lng: float | None = None


class LocationUpdate(BaseModel):
    lat: float
    lng: float
    battery: int | None = None


class ResponderOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    role: ResponderRole
    sector: int
    status: ResponderStatus
    battery: int
    lat: float | None
    lng: float | None
    last_seen: datetime | None

    model_config = {"from_attributes": True}


# ── Assignment ────────────────────────────────────────────────────────────────

class AssignmentOut(BaseModel):
    id: uuid.UUID
    sos_id: uuid.UUID
    responder_id: uuid.UUID
    eta_minutes: int | None
    distance_m: int | None
    ai_reason: str | None
    status: AssignmentStatus
    assigned_at: datetime

    model_config = {"from_attributes": True}
