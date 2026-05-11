import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Float, Integer, Boolean, Text,
    DateTime, ForeignKey, Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from db.database import Base
import enum


def utcnow():
    return datetime.now(timezone.utc)


class Severity(str, enum.Enum):
    critical = "critical"
    urgent = "urgent"
    low = "low"


class EmergencyType(str, enum.Enum):
    medical = "medical"
    trapped = "trapped"
    flood = "flood"
    fire = "fire"
    unknown = "unknown"


class SOSStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    resolved = "resolved"


class ResponderRole(str, enum.Enum):
    medic = "medic"
    rescue = "rescue"
    fire = "fire"


class ResponderStatus(str, enum.Enum):
    available = "available"
    en_route = "en_route"
    busy = "busy"
    off_duty = "off_duty"


class AssignmentStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class SOSPacket(Base):
    __tablename__ = "sos_packets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    victim_code: Mapped[str] = mapped_column(String(16), index=True)
    packet_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    severity: Mapped[Severity] = mapped_column(SAEnum(Severity), index=True)
    emergency_type: Mapped[EmergencyType] = mapped_column(SAEnum(EmergencyType))
    message: Mapped[str | None] = mapped_column(Text)
    model_score: Mapped[float | None] = mapped_column(Float)
    has_audio: Mapped[bool] = mapped_column(Boolean, default=False)
    has_image: Mapped[bool] = mapped_column(Boolean, default=False)
    hops: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[SOSStatus] = mapped_column(SAEnum(SOSStatus), default=SOSStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    assignment: Mapped["Assignment | None"] = relationship("Assignment", back_populates="sos", uselist=False)


class Responder(Base):
    __tablename__ = "responders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[ResponderRole] = mapped_column(SAEnum(ResponderRole))
    sector: Mapped[int] = mapped_column(Integer)
    status: Mapped[ResponderStatus] = mapped_column(SAEnum(ResponderStatus), default=ResponderStatus.available)
    battery: Mapped[int] = mapped_column(Integer, default=100)
    # Last known location (updated from Redis on heartbeat)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    assignments: Mapped[list["Assignment"]] = relationship("Assignment", back_populates="responder")


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sos_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sos_packets.id"))
    responder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("responders.id"))
    eta_minutes: Mapped[int | None] = mapped_column(Integer)
    distance_m: Mapped[int | None] = mapped_column(Integer)
    ai_reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AssignmentStatus] = mapped_column(SAEnum(AssignmentStatus), default=AssignmentStatus.active)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sos: Mapped["SOSPacket"] = relationship("SOSPacket", back_populates="assignment")
    responder: Mapped["Responder"] = relationship("Responder", back_populates="assignments")
