"""
Scheduling models: upcoming appointments, prescriptions/referrals and
healthcare payments.

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
    Numeric,
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


class PaymentStatus(Enum):
    """Whether a healthcare expense has been paid."""

    DUE = "due"
    PAID = "paid"
    CANCELLED = "cancelled"


class PaymentType(Enum):
    """Kind of healthcare expense."""

    COPAY = "copay"  # Patient share in a public/insured system (e.g. Italian "ticket")
    PRIVATE = "private"  # Fully private service
    INTRAMURAL = "intramural"  # Private service inside a public facility (e.g. "intramoenia")
    INSURANCE = "insurance"  # Insurance premium or deductible
    PHARMACY = "pharmacy"
    OTHER = "other"


class PaymentMethod(Enum):
    CASH = "cash"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    ONLINE = "online"
    OTHER = "other"


# Default due-date warnings: 3 days and 1 day before due_date.
DEFAULT_PAYMENT_DUE_REMINDER_DAYS = [3, 1]


def get_all_payment_statuses() -> list:
    return [s.value for s in PaymentStatus]


def get_all_payment_types() -> list:
    return [t.value for t in PaymentType]


def get_all_payment_methods() -> list:
    return [m.value for m in PaymentMethod]


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


class Payment(Base):
    """
    A healthcare expense: an amount due or paid for a visit, an exam, a
    prescription, a medication, ...

    Receipts are attached through the generic entity file system
    (entity_type "payment").
    """

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    patient_id = Column(
        Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    appointment_id = Column(
        Integer, ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True
    )
    prescription_id = Column(
        Integer, ForeignKey("prescriptions.id", ondelete="SET NULL"), nullable=True
    )
    # Who was paid: a known practice, or free text (pharmacy, lab, ...)
    practice_id = Column(
        Integer, ForeignKey("practices.id", ondelete="SET NULL"), nullable=True
    )
    payee = Column(String(200), nullable=True)

    description = Column(String(200), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False)  # ISO 4217 code
    payment_type = Column(String(30), nullable=False)  # PaymentType
    status = Column(String(20), nullable=False, default=PaymentStatus.DUE.value)
    due_date = Column(Date, nullable=True)
    paid_date = Column(Date, nullable=True)
    payment_method = Column(String(30), nullable=True)  # PaymentMethod
    reference_number = Column(String(100), nullable=True)  # Receipt / invoice no.
    tax_deductible = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)

    # Due-date warnings: days before due_date, only while status is due.
    reminder_enabled = Column(Boolean, nullable=False, default=True)
    due_reminder_days = Column(JSON, nullable=True)

    tags = Column(JSON, nullable=True, default=list)

    created_at = Column(DateTime, default=get_utc_now, nullable=False)
    updated_at = Column(
        DateTime, default=get_utc_now, onupdate=get_utc_now, nullable=False
    )

    patient = orm_relationship(
        "Patient",
        backref=backref("payments", cascade="all, delete-orphan", passive_deletes=True),
    )
    appointment = orm_relationship(
        "Appointment", backref=backref("payments", passive_deletes=True)
    )
    prescription = orm_relationship(
        "Prescription", backref=backref("payments", passive_deletes=True)
    )
    practice = orm_relationship("Practice")

    __table_args__ = (
        Index("idx_payments_patient_status", "patient_id", "status"),
        Index("idx_payments_status_due", "status", "due_date"),
        Index("idx_payments_appointment_id", "appointment_id"),
        Index("idx_payments_prescription_id", "prescription_id"),
    )
