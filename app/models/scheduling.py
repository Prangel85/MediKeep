"""
Scheduling models: upcoming appointments (and, in later steps, prescriptions
and payments).

Kept in a dedicated module so the feature stays isolated from the existing
clinical models. Relationships towards existing tables (Patient,
Practitioner, Practice, Encounter) are declared from this side only - the
Patient side uses a ``backref`` - so no existing model file has to change.
"""

from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import backref
from sqlalchemy.orm import relationship as orm_relationship

from .base import Base, get_utc_now


class AppointmentStatus(Enum):
    """Lifecycle of a scheduled appointment."""

    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AppointmentType(Enum):
    """Generic kind of appointment. Free text is not allowed so the UI can translate it."""

    VISIT = "visit"  # Consultation with a practitioner
    FOLLOW_UP = "follow_up"
    EXAM = "exam"  # Diagnostic exam / imaging
    LAB_TEST = "lab_test"
    PROCEDURE = "procedure"
    THERAPY = "therapy"  # Recurring therapy session (physio, chemo, ...)
    VACCINATION = "vaccination"
    TELEHEALTH = "telehealth"
    OTHER = "other"


# Statuses for which reminders are still meaningful.
ACTIVE_APPOINTMENT_STATUSES = (
    AppointmentStatus.SCHEDULED.value,
    AppointmentStatus.CONFIRMED.value,
)

# Default reminder lead times in minutes: 7 days, 1 day, 2 hours.
DEFAULT_APPOINTMENT_REMINDER_OFFSETS = [7 * 24 * 60, 24 * 60, 120]


def get_all_appointment_statuses() -> list:
    return [s.value for s in AppointmentStatus]


def get_all_appointment_types() -> list:
    return [t.value for t in AppointmentType]


class Appointment(Base):
    """
    A future (or past, not yet recorded) appointment for a patient.

    ``scheduled_at`` is stored in UTC like ``Vitals.recorded_date``. When the
    appointment takes place it can be marked completed, which creates or links
    an ``Encounter`` (the record of what actually happened).
    """

    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True)
    patient_id = Column(
        Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    practitioner_id = Column(
        Integer, ForeignKey("practitioners.id", ondelete="SET NULL"), nullable=True
    )
    practice_id = Column(
        Integer, ForeignKey("practices.id", ondelete="SET NULL"), nullable=True
    )
    # Encounter recorded when the appointment was completed.
    encounter_id = Column(
        Integer, ForeignKey("encounters.id", ondelete="SET NULL"), nullable=True
    )

    title = Column(String(200), nullable=False)
    appointment_type = Column(String(50), nullable=True)  # AppointmentType values
    scheduled_at = Column(DateTime, nullable=False)  # UTC
    duration_minutes = Column(Integer, nullable=True)
    location = Column(String(300), nullable=True)
    status = Column(
        String(20), nullable=False, default=AppointmentStatus.SCHEDULED.value
    )
    notes = Column(Text, nullable=True)

    # Reminders: list of lead times in minutes before scheduled_at.
    reminder_enabled = Column(Boolean, nullable=False, default=True)
    reminder_offsets_minutes = Column(JSON, nullable=True)

    tags = Column(JSON, nullable=True, default=list)

    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(
        DateTime, default=get_utc_now, onupdate=get_utc_now, nullable=False
    )

    patient = orm_relationship(
        "Patient",
        backref=backref(
            "appointments", cascade="all, delete-orphan", passive_deletes=True
        ),
    )
    practitioner = orm_relationship("Practitioner")
    practice = orm_relationship("Practice")
    encounter = orm_relationship("Encounter")

    __table_args__ = (
        Index("idx_appointments_patient_scheduled", "patient_id", "scheduled_at"),
        Index("idx_appointments_status_scheduled", "status", "scheduled_at"),
        Index("idx_appointments_encounter_id", "encounter_id"),
    )
