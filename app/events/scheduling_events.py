"""
Scheduling domain events: upcoming appointments, expiring prescriptions and
payments coming due.

Published by app/services/scheduling_reminder_scheduler.py. ``user_id``
(inherited from DomainEvent) is the patient owner, like medication reminders.

Each event carries the fields of its idempotency key - the scheduler looks
them up in NotificationHistory.event_data so a reminder is sent only once:

- appointment_upcoming: (appointment_id, offset_minutes, scheduled_at_utc)
- prescription_expiring: (prescription_id, days_before, expiry_date)
- payment_due: (payment_id, days_before, due_date)
"""

from dataclasses import dataclass
from typing import Optional

from app.core.events.base import DomainEvent


@dataclass(frozen=True)
class AppointmentUpcomingEvent(DomainEvent):
    """
    Fired when a reminder lead time of an appointment is reached.

    Attributes:
        patient_id: Patient the appointment belongs to
        appointment_id: The appointment
        title: Display title for the notification body
        scheduled_at_local: "YYYY-MM-DD HH:MM" in facility local time
        scheduled_at_utc: ISO UTC timestamp (idempotency key)
        offset_minutes: Reminder lead time that triggered this event
        location: Optional location for the notification body
        practitioner_name: Optional practitioner name for the notification body
    """

    patient_id: int = 0
    appointment_id: int = 0
    title: str = ""
    scheduled_at_local: str = ""
    scheduled_at_utc: str = ""
    offset_minutes: int = 0
    location: Optional[str] = None
    practitioner_name: Optional[str] = None


@dataclass(frozen=True)
class PrescriptionExpiringEvent(DomainEvent):
    """
    Fired when an unused prescription is ``days_before`` days from expiry.

    Attributes:
        patient_id: Patient the prescription belongs to
        prescription_id: The prescription
        title: Display title for the notification body
        prescription_number: Optional identifier (e.g. Italian NRE)
        expiry_date: YYYY-MM-DD (idempotency key)
        days_before: Days left before expiry (idempotency key)
    """

    patient_id: int = 0
    prescription_id: int = 0
    title: str = ""
    prescription_number: Optional[str] = None
    expiry_date: str = ""
    days_before: int = 0


@dataclass(frozen=True)
class PaymentDueEvent(DomainEvent):
    """
    Fired when an unpaid payment is ``days_before`` days from its due date.

    Attributes:
        patient_id: Patient the payment belongs to
        payment_id: The payment
        description: Display text for the notification body
        amount: Amount as a plain decimal string, e.g. "36.15"
        currency: ISO 4217 code
        due_date: YYYY-MM-DD (idempotency key)
        days_before: Days left before the due date (idempotency key)
    """

    patient_id: int = 0
    payment_id: int = 0
    description: str = ""
    amount: str = ""
    currency: str = ""
    due_date: str = ""
    days_before: int = 0
