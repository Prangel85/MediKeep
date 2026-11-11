"""
Scheduling models: upcoming appointments, prescriptions/referrals (and, in a
later step, payments).

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
    Date,
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


class PrescriptionStatus(Enum):
    """Lifecycle of a prescription / referral."""

    ACTIVE = "active"  # Issued, not used yet
    USED = "used"  # Filled at the pharmacy / exam booked or performed
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PrescriptionType(Enum):
    """What the prescription is for."""

    MEDICATION = "medication"
    EXAM = "exam"  # Lab test, imaging, diagnostic exam
    REFERRAL = "referral"  # Specialist visit
    THERAPY = "therapy"  # Physiotherapy, rehabilitation, ...
    DEVICE = "device"  # Medical device / equipment
    OTHER = "other"


# Default expiry warnings: 7 days and 1 day before expiry_date.
DEFAULT_PRESCRIPTION_EXPIRY_REMINDER_DAYS = [7, 1]


def get_all_prescription_statuses() -> list:
    return [s.value for s in PrescriptionStatus]


def get_all_prescription_types() -> list:
    return [t.value for t in PrescriptionType]


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


class Prescription(Base):
    """
    A prescription or referral issued for a patient (medication, exam,
    specialist visit, ...).

    Country-specific concepts map onto generic fields: e.g. the Italian NRE
    is ``prescription_number``, the U/B/D/P priority class is ``priority`` and
    the exemption code is ``exemption_code``. Nothing here is tied to a
    single health system.
    """

    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True)
    patient_id = Column(
        Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    # Prescribing practitioner
    practitioner_id = Column(
        Integer, ForeignKey("practitioners.id", ondelete="SET NULL"), nullable=True
    )
    # Appointment the prescription is used for (or that produced it)
    appointment_id = Column(
        Integer, ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True
    )
    medication_id = Column(
        Integer, ForeignKey("medications.id", ondelete="SET NULL"), nullable=True
    )

    prescription_number = Column(String(100), nullable=True)
    prescription_type = Column(String(30), nullable=False)  # PrescriptionType
    title = Column(String(200), nullable=False)
    issued_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=True)
    priority = Column(String(30), nullable=True)
    exemption_code = Column(String(50), nullable=True)
    # Prescribed items: [{"description": str, "code": str|None, "quantity": int|None}]
    items = Column(JSON, nullable=True)
    status = Column(
        String(20), nullable=False, default=PrescriptionStatus.ACTIVE.value
    )
    used_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    # Expiry warnings: days before expiry_date, only while status is active.
    reminder_enabled = Column(Boolean, nullable=False, default=True)
    expiry_reminder_days = Column(JSON, nullable=True)

    tags = Column(JSON, nullable=True, default=list)

    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(
        DateTime, default=get_utc_now, onupdate=get_utc_now, nullable=False
    )

    patient = orm_relationship(
        "Patient",
        backref=backref(
            "prescriptions", cascade="all, delete-orphan", passive_deletes=True
        ),
    )
    practitioner = orm_relationship("Practitioner")
    appointment = orm_relationship(
        "Appointment", backref=backref("prescriptions", passive_deletes=True)
    )
    medication = orm_relationship("Medication")

    __table_args__ = (
        Index("idx_prescriptions_patient_issued", "patient_id", "issued_date"),
        Index("idx_prescriptions_status_expiry", "status", "expiry_date"),
        Index("idx_prescriptions_appointment_id", "appointment_id"),
    )
