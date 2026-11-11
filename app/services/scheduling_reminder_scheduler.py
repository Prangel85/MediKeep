"""
Scheduling Reminder Scheduler Service

Publishes reminders for the scheduling feature:

- AppointmentUpcomingEvent: checked every minute. For each scheduled or
  confirmed appointment with reminders on, every lead time in
  ``reminder_offsets_minutes`` gives a fire time (scheduled_at - offset). A
  reminder is sent once its fire time has passed, as long as it is no older
  than APPOINTMENT_GRACE_MINUTES (so a restart does not lose it, but stale
  lead times - e.g. the 7-day one of an appointment created 2 days ahead -
  are skipped) and the appointment has not started yet.
- PrescriptionExpiringEvent / PaymentDueEvent: checked hourly, sent from
  DAILY_REMINDER_HOUR (facility time) onwards on each day that matches one of
  the configured "days before" values. Checking hourly instead of once a day
  means a restart or downtime at the chosen hour does not skip the day.

Same model as medication_reminder_scheduler.py: APScheduler in the facility
timezone, and no duplicate sends - every event carries its idempotency key,
which is looked up in NotificationHistory.event_data before publishing. A
process-local set also remembers what was published, so owners without any
enabled channel (no history row is written for them) are not re-processed
every tick.

PHI is never logged: titles, descriptions and amounts stay out of log
payloads; only IDs, lead times and dates are recorded.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, List, Optional, Set, Tuple

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from app.core.events.base import DomainEvent
from app.core.events.bus import get_event_bus
from app.core.logging.config import get_logger
from app.core.logging.constants import LogFields
from app.core.utils.datetime_utils import get_facility_timezone, to_utc
from app.events.scheduling_events import (
    AppointmentUpcomingEvent,
    PaymentDueEvent,
    PrescriptionExpiringEvent,
)
from app.models.notifications import NotificationHistory
from app.models.patient import Patient
from app.models.practice import Practitioner
from app.models.scheduling import (
    ACTIVE_APPOINTMENT_STATUSES,
    DEFAULT_APPOINTMENT_REMINDER_OFFSETS,
    DEFAULT_PAYMENT_DUE_REMINDER_DAYS,
    DEFAULT_PRESCRIPTION_EXPIRY_REMINDER_DAYS,
    Appointment,
    Payment,
    PaymentStatus,
    Prescription,
    PrescriptionStatus,
)

logger = get_logger(__name__, "app")

APPOINTMENT_JOB_ID = "scheduling_appointment_reminder_tick"
DUE_DATES_JOB_ID = "scheduling_due_date_reminder_tick"

# How late an appointment reminder may still be sent after its fire time.
APPOINTMENT_GRACE_MINUTES = 30
# Longest accepted appointment lead time (matches the schema limit).
MAX_APPOINTMENT_OFFSET_MINUTES = 60 * 24 * 60
# Facility-local hour from which daily (prescription/payment) reminders go out.
DAILY_REMINDER_HOUR = 8

APPOINTMENT_EVENT = "appointment_upcoming"
PRESCRIPTION_EVENT = "prescription_expiring"
PAYMENT_EVENT = "payment_due"

# (entity_id, lead, date-or-timestamp) - see app/events/scheduling_events.py
DedupKey = Tuple[int, int, str]


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _utc_iso(naive_utc: datetime) -> str:
    return naive_utc.replace(tzinfo=timezone.utc).isoformat()


def _valid_ints(values, default: List[int]) -> List[int]:
    """Stored JSON lists are trusted loosely: drop anything not a positive int."""
    if values is None:
        values = default
    if not isinstance(values, list):
        return []
    return [v for v in values if isinstance(v, int) and not isinstance(v, bool) and v > 0]


class SchedulingReminderSchedulerService:
    """Singleton APScheduler wrapper for appointment/prescription/payment reminders."""

    _instance: Optional["SchedulingReminderSchedulerService"] = None

    def __init__(self) -> None:
        self._scheduler: AsyncIOScheduler = AsyncIOScheduler(
            timezone=get_facility_timezone()
        )
        # Keys published by this process, per event type (see module docstring).
        self._published: dict = {
            APPOINTMENT_EVENT: set(),
            PRESCRIPTION_EVENT: set(),
            PAYMENT_EVENT: set(),
        }

    @classmethod
    def get_instance(cls) -> "SchedulingReminderSchedulerService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Tests only - tear down the singleton."""
        if cls._instance is not None:
            if cls._instance._scheduler.running:
                cls._instance._scheduler.shutdown(wait=False)
            cls._instance = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        if not self._scheduler.running:
            self._scheduler.start()

        tz = get_facility_timezone()
        self._scheduler.add_job(
            self._appointment_tick,
            # Explicit timezone: a pre-built CronTrigger defaults to the host tz.
            trigger=CronTrigger(second=0, timezone=tz),
            id=APPOINTMENT_JOB_ID,
            name="Appointment Reminder Tick",
            replace_existing=True,
            misfire_grace_time=120,
            coalesce=True,
        )
        self._scheduler.add_job(
            self._due_dates_tick,
            trigger=CronTrigger(minute=5, timezone=tz),
            id=DUE_DATES_JOB_ID,
            name="Prescription/Payment Reminder Tick",
            replace_existing=True,
            misfire_grace_time=1800,
            coalesce=True,
        )
        logger.info(
            "Scheduling reminder scheduler started",
            extra={
                LogFields.CATEGORY: "app",
                LogFields.EVENT: "scheduling_reminder_scheduler_started",
            },
        )

    async def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info(
                "Scheduling reminder scheduler stopped",
                extra={
                    LogFields.CATEGORY: "app",
                    LogFields.EVENT: "scheduling_reminder_scheduler_stopped",
                },
            )

    # ------------------------------------------------------------------
    # Ticks (open a session, never raise)
    # ------------------------------------------------------------------

    async def _appointment_tick(self) -> None:
        await self._run_tick(
            "appointment",
            lambda db: self.process_appointments(db, datetime.now(timezone.utc)),
        )

    async def _due_dates_tick(self) -> None:
        async def run(db: Session) -> int:
            now_local = datetime.now(get_facility_timezone())
            if now_local.hour < DAILY_REMINDER_HOUR:
                return 0
            today = now_local.date()
            sent = await self.process_prescriptions(db, today)
            sent += await self.process_payments(db, today)
            return sent

        await self._run_tick("due_dates", run)

    async def _run_tick(self, name: str, fn) -> None:
        from app.core.database.database import SessionLocal

        db: Session = SessionLocal()
        try:
            published = await fn(db)
            log = logger.info if published else logger.debug
            log(
                "Scheduling reminder tick complete",
                extra={
                    LogFields.CATEGORY: "app",
                    LogFields.EVENT: f"scheduling_{name}_reminders_tick_complete",
                    "events_published": published,
                },
            )
        except Exception as e:
            logger.error(
                "Scheduling reminder tick failed",
                extra={
                    LogFields.CATEGORY: "app",
                    LogFields.EVENT: f"scheduling_{name}_reminder_tick_error",
                    LogFields.ERROR: str(e),
                },
                exc_info=True,
            )
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Appointments
    # ------------------------------------------------------------------

    async def process_appointments(self, db: Session, now: datetime) -> int:
        """Publish due appointment reminders at ``now``. Returns events published."""
        now_utc = _naive_utc(now)
        rows = await asyncio.to_thread(self._discover_appointments, db, now_utc)

        due: List[Tuple[DedupKey, object, int]] = []
        grace = timedelta(minutes=APPOINTMENT_GRACE_MINUTES)
        for row in rows:
            scheduled_iso = _utc_iso(row.scheduled_at)
            for offset in _valid_ints(
                row.reminder_offsets_minutes, DEFAULT_APPOINTMENT_REMINDER_OFFSETS
            ):
                fire_at = row.scheduled_at - timedelta(minutes=offset)
                if fire_at <= now_utc < fire_at + grace:
                    due.append(((row.id, offset, scheduled_iso), row, offset))

        if not due:
            return 0

        since = now_utc - grace - timedelta(minutes=10)
        already = await asyncio.to_thread(
            self._fired_keys,
            db,
            APPOINTMENT_EVENT,
            since,
            ("appointment_id", "offset_minutes", "scheduled_at_utc"),
        )
        to_publish = self._filter_new(APPOINTMENT_EVENT, due, already)

        await asyncio.gather(
            *(
                self._publish(
                    APPOINTMENT_EVENT,
                    key,
                    AppointmentUpcomingEvent(
                        user_id=row.owner_user_id,
                        patient_id=row.patient_id,
                        appointment_id=row.id,
                        title=row.title,
                        scheduled_at_local=row.scheduled_at.replace(tzinfo=timezone.utc)
                        .astimezone(get_facility_timezone())
                        .strftime("%Y-%m-%d %H:%M"),
                        scheduled_at_utc=key[2],
                        offset_minutes=offset,
                        location=row.location,
                        practitioner_name=row.practitioner_name,
                    ),
                    {"appointment_id": row.id, "offset_minutes": offset},
                    row.patient_id,
                    row.owner_user_id,
                )
                for key, row, offset in to_publish
            )
        )
        self._prune(APPOINTMENT_EVENT, keep=lambda k: k[2] >= _utc_iso(since))
        return len(to_publish)

    def _discover_appointments(self, db: Session, now_utc: datetime) -> list:
        """Active appointments with reminders on, starting within the longest lead time."""
        return (
            db.query(
                Appointment.id,
                Appointment.patient_id,
                Appointment.title,
                Appointment.scheduled_at,
                Appointment.location,
                Appointment.reminder_offsets_minutes,
                Practitioner.name.label("practitioner_name"),
                Patient.owner_user_id,
            )
            .join(Patient, Patient.id == Appointment.patient_id)
            .outerjoin(Practitioner, Practitioner.id == Appointment.practitioner_id)
            .filter(Appointment.reminder_enabled.is_(True))
            .filter(Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES))
            .filter(Appointment.scheduled_at > now_utc)
            .filter(
                Appointment.scheduled_at
                <= now_utc + timedelta(minutes=MAX_APPOINTMENT_OFFSET_MINUTES)
            )
            .all()
        )

    # ------------------------------------------------------------------
    # Prescriptions and payments
    # ------------------------------------------------------------------

    async def process_prescriptions(self, db: Session, today: date) -> int:
        """Publish expiry warnings for unused prescriptions on ``today``."""
        rows = await asyncio.to_thread(self._discover_prescriptions, db, today)
        due = []
        for row in rows:
            days_left = (row.expiry_date - today).days
            if days_left in _valid_ints(
                row.expiry_reminder_days, DEFAULT_PRESCRIPTION_EXPIRY_REMINDER_DAYS
            ):
                due.append(((row.id, days_left, row.expiry_date.isoformat()), row, days_left))
        if not due:
            return 0

        already = await asyncio.to_thread(
            self._fired_keys,
            db,
            PRESCRIPTION_EVENT,
            self._local_midnight_utc(today),
            ("prescription_id", "days_before", "expiry_date"),
        )
        to_publish = self._filter_new(PRESCRIPTION_EVENT, due, already)
        await asyncio.gather(
            *(
                self._publish(
                    PRESCRIPTION_EVENT,
                    key,
                    PrescriptionExpiringEvent(
                        user_id=row.owner_user_id,
                        patient_id=row.patient_id,
                        prescription_id=row.id,
                        title=row.title,
                        prescription_number=row.prescription_number,
                        expiry_date=key[2],
                        days_before=days_left,
                    ),
                    {"prescription_id": row.id, "days_before": days_left},
                    row.patient_id,
                    row.owner_user_id,
                )
                for key, row, days_left in to_publish
            )
        )
        self._prune(PRESCRIPTION_EVENT, keep=lambda k: k[2] >= today.isoformat())
        return len(to_publish)

    def _discover_prescriptions(self, db: Session, today: date) -> list:
        return (
            db.query(
                Prescription.id,
                Prescription.patient_id,
                Prescription.title,
                Prescription.prescription_number,
                Prescription.expiry_date,
                Prescription.expiry_reminder_days,
                Patient.owner_user_id,
            )
            .join(Patient, Patient.id == Prescription.patient_id)
            .filter(Prescription.reminder_enabled.is_(True))
            .filter(Prescription.status == PrescriptionStatus.ACTIVE.value)
            .filter(Prescription.expiry_date.isnot(None))
            .filter(Prescription.expiry_date >= today)
            .all()
        )

    async def process_payments(self, db: Session, today: date) -> int:
        """Publish due-date warnings for unpaid payments on ``today``."""
        rows = await asyncio.to_thread(self._discover_payments, db, today)
        due = []
        for row in rows:
            days_left = (row.due_date - today).days
            if days_left in _valid_ints(
                row.due_reminder_days, DEFAULT_PAYMENT_DUE_REMINDER_DAYS
            ):
                due.append(((row.id, days_left, row.due_date.isoformat()), row, days_left))
        if not due:
            return 0

        already = await asyncio.to_thread(
            self._fired_keys,
            db,
            PAYMENT_EVENT,
            self._local_midnight_utc(today),
            ("payment_id", "days_before", "due_date"),
        )
        to_publish = self._filter_new(PAYMENT_EVENT, due, already)
        await asyncio.gather(
            *(
                self._publish(
                    PAYMENT_EVENT,
                    key,
                    PaymentDueEvent(
                        user_id=row.owner_user_id,
                        patient_id=row.patient_id,
                        payment_id=row.id,
                        description=row.description,
                        amount=f"{row.amount:.2f}",
                        currency=row.currency,
                        due_date=key[2],
                        days_before=days_left,
                    ),
                    {"payment_id": row.id, "days_before": days_left},
                    row.patient_id,
                    row.owner_user_id,
                )
                for key, row, days_left in to_publish
            )
        )
        self._prune(PAYMENT_EVENT, keep=lambda k: k[2] >= today.isoformat())
        return len(to_publish)

    def _discover_payments(self, db: Session, today: date) -> list:
        return (
            db.query(
                Payment.id,
                Payment.patient_id,
                Payment.description,
                Payment.amount,
                Payment.currency,
                Payment.due_date,
                Payment.due_reminder_days,
                Patient.owner_user_id,
            )
            .join(Patient, Patient.id == Payment.patient_id)
            .filter(Payment.reminder_enabled.is_(True))
            .filter(Payment.status == PaymentStatus.DUE.value)
            .filter(Payment.due_date.isnot(None))
            .filter(Payment.due_date >= today)
            .all()
        )

    # ------------------------------------------------------------------
    # Dedup + publish helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _local_midnight_utc(day: date) -> datetime:
        midnight = datetime.combine(day, datetime.min.time()).replace(
            tzinfo=get_facility_timezone()
        )
        return _naive_utc(to_utc(midnight))

    @staticmethod
    def _fired_keys(
        db: Session,
        event_type: str,
        since_utc: datetime,
        key_fields: Tuple[str, str, str],
    ) -> Set[DedupKey]:
        """Idempotency keys already present in NotificationHistory since ``since_utc``."""
        rows = (
            db.query(NotificationHistory.event_data)
            .filter(NotificationHistory.event_type == event_type)
            .filter(NotificationHistory.created_at >= since_utc)
            .all()
        )
        keys: Set[DedupKey] = set()
        id_field, lead_field, when_field = key_fields
        for (data,) in rows:
            data = data or {}
            try:
                keys.add((int(data[id_field]), int(data[lead_field]), str(data[when_field])))
            except (KeyError, TypeError, ValueError):
                continue
        return keys

    def _filter_new(self, event_type: str, due: Iterable, already: Set[DedupKey]) -> list:
        published = self._published[event_type]
        fresh = []
        for item in due:
            key = item[0]
            if key in already or key in published:
                logger.debug(
                    "Scheduling reminder dedup skip",
                    extra={
                        LogFields.CATEGORY: "app",
                        LogFields.EVENT: f"{event_type}_dedup_skip",
                        "record_id": key[0],
                        "lead": key[1],
                    },
                )
                continue
            fresh.append(item)
        return fresh

    def _prune(self, event_type: str, keep) -> None:
        """Forget keys that can no longer be due (bounded memory)."""
        published = self._published[event_type]
        for key in [k for k in published if not keep(k)]:
            published.discard(key)

    async def _publish(
        self,
        event_type: str,
        key: DedupKey,
        event: DomainEvent,
        log_ids: dict,
        patient_id: int,
        owner_user_id: int,
    ) -> None:
        await get_event_bus().publish(event)
        self._published[event_type].add(key)
        logger.info(
            "Scheduling reminder published",
            extra={
                LogFields.CATEGORY: "app",
                LogFields.EVENT: f"{event_type}_published",
                LogFields.PATIENT_ID: patient_id,
                LogFields.USER_ID: owner_user_id,
                **log_ids,
            },
        )
