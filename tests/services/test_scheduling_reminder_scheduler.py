"""
Tests for SchedulingReminderSchedulerService.

APScheduler is not started: the process_* methods are called directly with a
controlled "now"/"today", and the event bus is mocked.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.orm import Session

from app.crud.patient import patient as patient_crud
from app.events.scheduling_events import (
    AppointmentUpcomingEvent,
    PaymentDueEvent,
    PrescriptionExpiringEvent,
)
from app.models.notifications import NotificationHistory
from app.models.scheduling import Appointment, Payment, Prescription
from app.schemas.patient import PatientCreate
from app.services.scheduling_notification_templates import (
    appointment_upcoming_template,
    format_lead_time,
    payment_due_template,
    prescription_expiring_template,
)
from app.services.scheduling_reminder_scheduler import (
    APPOINTMENT_GRACE_MINUTES,
    SchedulingReminderSchedulerService,
)

NOW = datetime(2030, 3, 10, 9, 0, tzinfo=timezone.utc)
TODAY = date(2030, 3, 10)


@pytest.fixture(autouse=True)
def reset_scheduler():
    SchedulingReminderSchedulerService.reset_instance()
    yield
    SchedulingReminderSchedulerService.reset_instance()


@pytest.fixture
def mock_bus():
    with patch("app.services.scheduling_reminder_scheduler.get_event_bus") as factory:
        factory.return_value.publish = AsyncMock()
        yield factory.return_value


@pytest.fixture
def patient(db_session: Session, test_user):
    return patient_crud.create_for_user(
        db_session,
        user_id=test_user.id,
        patient_data=PatientCreate(
            first_name="Remind", last_name="Me", birth_date=date(1990, 1, 1), gender="F"
        ),
    )


def _service() -> SchedulingReminderSchedulerService:
    return SchedulingReminderSchedulerService.get_instance()


def _published(mock_bus) -> list:
    return [call.args[0] for call in mock_bus.publish.await_args_list]


def _appointment(db, patient, starts_in: timedelta, **kw) -> Appointment:
    obj = Appointment(
        patient_id=patient.id,
        title=kw.pop("title", "Cardiology"),
        scheduled_at=(NOW + starts_in).replace(tzinfo=None),
        **kw,
    )
    db.add(obj)
    db.commit()
    return obj


@pytest.mark.asyncio
class TestAppointmentReminders:
    async def test_fires_at_lead_time(self, db_session, patient, test_user, mock_bus):
        appt = _appointment(
            db_session, patient, timedelta(days=1), location="Room 2",
            reminder_offsets_minutes=[1440, 120],
        )
        assert await _service().process_appointments(db_session, NOW) == 1

        (event,) = _published(mock_bus)
        assert isinstance(event, AppointmentUpcomingEvent)
        assert event.user_id == test_user.id
        assert event.appointment_id == appt.id
        assert event.offset_minutes == 1440
        assert event.location == "Room 2"
        assert event.scheduled_at_utc == "2030-03-11T09:00:00+00:00"

    async def test_default_offsets_when_unset(self, db_session, patient, mock_bus):
        _appointment(db_session, patient, timedelta(hours=2), reminder_offsets_minutes=None)
        assert await _service().process_appointments(db_session, NOW) == 1
        assert _published(mock_bus)[0].offset_minutes == 120

    async def test_within_grace_window_still_fires(self, db_session, patient, mock_bus):
        _appointment(
            db_session, patient,
            timedelta(minutes=120 - (APPOINTMENT_GRACE_MINUTES - 1)),
            reminder_offsets_minutes=[120],
        )
        assert await _service().process_appointments(db_session, NOW) == 1

    async def test_stale_and_future_lead_times_skipped(self, db_session, patient, mock_bus):
        # 7-day lead time passed long ago; 2-hour one not reached yet
        _appointment(db_session, patient, timedelta(days=2), reminder_offsets_minutes=[10080, 120])
        assert await _service().process_appointments(db_session, NOW) == 0
        mock_bus.publish.assert_not_awaited()

    @pytest.mark.parametrize(
        "kw",
        [
            {"status": "cancelled"},
            {"status": "completed"},
            {"reminder_enabled": False},
        ],
    )
    async def test_inactive_skipped(self, db_session, patient, mock_bus, kw):
        _appointment(db_session, patient, timedelta(hours=2), reminder_offsets_minutes=[120], **kw)
        assert await _service().process_appointments(db_session, NOW) == 0

    async def test_confirmed_fires(self, db_session, patient, mock_bus):
        _appointment(
            db_session, patient, timedelta(hours=2), reminder_offsets_minutes=[120],
            status="confirmed",
        )
        assert await _service().process_appointments(db_session, NOW) == 1

    async def test_no_duplicate_within_process(self, db_session, patient, mock_bus):
        _appointment(db_session, patient, timedelta(hours=2), reminder_offsets_minutes=[120])
        service = _service()
        assert await service.process_appointments(db_session, NOW) == 1
        assert await service.process_appointments(db_session, NOW + timedelta(minutes=1)) == 0
        assert mock_bus.publish.await_count == 1

    async def test_no_duplicate_after_restart(self, db_session, patient, test_user, mock_bus):
        appt = _appointment(db_session, patient, timedelta(hours=2), reminder_offsets_minutes=[120])
        db_session.add(
            NotificationHistory(
                user_id=test_user.id,
                event_type="appointment_upcoming",
                event_data={
                    "appointment_id": appt.id,
                    "offset_minutes": 120,
                    "scheduled_at_utc": "2030-03-10T11:00:00+00:00",
                },
                title="t",
                status="sent",
                created_at=NOW.replace(tzinfo=None),
            )
        )
        db_session.commit()
        # Fresh singleton = fresh process memory
        assert await _service().process_appointments(db_session, NOW + timedelta(minutes=1)) == 0

    async def test_rescheduled_appointment_reminds_again(self, db_session, patient, mock_bus):
        appt = _appointment(db_session, patient, timedelta(hours=2), reminder_offsets_minutes=[120])
        service = _service()
        assert await service.process_appointments(db_session, NOW) == 1
        appt.scheduled_at = appt.scheduled_at + timedelta(minutes=10)
        db_session.commit()
        assert await service.process_appointments(db_session, NOW + timedelta(minutes=10)) == 1

    async def test_past_appointment_skipped(self, db_session, patient, mock_bus):
        _appointment(db_session, patient, timedelta(minutes=-5), reminder_offsets_minutes=[10])
        assert await _service().process_appointments(db_session, NOW) == 0


def _prescription(db, patient, expires_in_days, **kw) -> Prescription:
    obj = Prescription(
        patient_id=patient.id,
        title=kw.pop("title", "MRI referral"),
        prescription_type="exam",
        issued_date=date(2030, 1, 1),
        expiry_date=TODAY + timedelta(days=expires_in_days),
        **kw,
    )
    db.add(obj)
    db.commit()
    return obj


@pytest.mark.asyncio
class TestPrescriptionReminders:
    async def test_fires_on_matching_day(self, db_session, patient, test_user, mock_bus):
        rx = _prescription(db_session, patient, 7, prescription_number="NRE123")
        assert await _service().process_prescriptions(db_session, TODAY) == 1
        (event,) = _published(mock_bus)
        assert isinstance(event, PrescriptionExpiringEvent)
        assert event.user_id == test_user.id
        assert event.prescription_id == rx.id
        assert event.days_before == 7
        assert event.expiry_date == "2030-03-17"
        assert event.prescription_number == "NRE123"

    async def test_non_matching_days_skipped(self, db_session, patient, mock_bus):
        _prescription(db_session, patient, 5)
        _prescription(db_session, patient, 7, expiry_reminder_days=[3])
        assert await _service().process_prescriptions(db_session, TODAY) == 0

    @pytest.mark.parametrize(
        "kw", [{"status": "used"}, {"status": "cancelled"}, {"reminder_enabled": False}]
    )
    async def test_inactive_skipped(self, db_session, patient, mock_bus, kw):
        _prescription(db_session, patient, 1, **kw)
        assert await _service().process_prescriptions(db_session, TODAY) == 0

    async def test_once_per_day_even_after_restart(self, db_session, patient, test_user, mock_bus):
        rx = _prescription(db_session, patient, 1)
        assert await _service().process_prescriptions(db_session, TODAY) == 1
        assert await _service().process_prescriptions(db_session, TODAY) == 0

        SchedulingReminderSchedulerService.reset_instance()
        db_session.add(
            NotificationHistory(
                user_id=test_user.id,
                event_type="prescription_expiring",
                event_data={"prescription_id": rx.id, "days_before": 1, "expiry_date": "2030-03-11"},
                title="t",
                status="sent",
                created_at=datetime(2030, 3, 10, 8, 30),
            )
        )
        db_session.commit()
        assert await _service().process_prescriptions(db_session, TODAY) == 0


def _payment(db, patient, due_in_days, **kw) -> Payment:
    obj = Payment(
        patient_id=patient.id,
        description=kw.pop("description", "Physio"),
        amount=Decimal("45.5"),
        currency="EUR",
        payment_type="private",
        due_date=TODAY + timedelta(days=due_in_days),
        **kw,
    )
    db.add(obj)
    db.commit()
    return obj


@pytest.mark.asyncio
class TestPaymentReminders:
    async def test_fires_on_matching_day(self, db_session, patient, mock_bus):
        pay = _payment(db_session, patient, 3)
        assert await _service().process_payments(db_session, TODAY) == 1
        (event,) = _published(mock_bus)
        assert isinstance(event, PaymentDueEvent)
        assert event.payment_id == pay.id
        assert event.amount == "45.50"
        assert event.currency == "EUR"
        assert event.days_before == 3

    @pytest.mark.parametrize(
        "kw", [{"status": "paid"}, {"status": "cancelled"}, {"reminder_enabled": False}]
    )
    async def test_inactive_skipped(self, db_session, patient, mock_bus, kw):
        _payment(db_session, patient, 1, **kw)
        assert await _service().process_payments(db_session, TODAY) == 0

    async def test_custom_days(self, db_session, patient, mock_bus):
        _payment(db_session, patient, 10, due_reminder_days=[10])
        assert await _service().process_payments(db_session, TODAY) == 1


@pytest.mark.asyncio
class TestTicks:
    async def test_due_dates_tick_waits_for_daily_hour(self, db_session, patient, mock_bus):
        service = _service()
        with patch("app.services.scheduling_reminder_scheduler.datetime") as fake_dt, patch(
            "app.core.database.database.SessionLocal", return_value=db_session
        ), patch.object(db_session, "close"):
            fake_dt.now.return_value = datetime(2030, 3, 10, 6, 0, tzinfo=timezone.utc)
            fake_dt.combine = datetime.combine
            fake_dt.min = datetime.min
            with patch.object(service, "process_prescriptions", AsyncMock(return_value=0)) as p:
                await service._due_dates_tick()
                p.assert_not_awaited()

    async def test_tick_never_raises(self, db_session, mock_bus):
        service = _service()
        with patch(
            "app.core.database.database.SessionLocal", return_value=db_session
        ), patch.object(db_session, "close"), patch.object(
            service, "process_appointments", AsyncMock(side_effect=RuntimeError("boom"))
        ):
            await service._appointment_tick()  # logged, not raised

    async def test_start_registers_jobs_and_shutdown(self):
        service = _service()
        await service.start()
        try:
            job_ids = {job.id for job in service._scheduler.get_jobs()}
            assert job_ids == {
                "scheduling_appointment_reminder_tick",
                "scheduling_due_date_reminder_tick",
            }
        finally:
            await service.shutdown()


class TestTemplates:
    @pytest.mark.parametrize(
        "minutes,expected",
        [(10080, "7 days"), (1440, "1 day"), (120, "2 hours"), (60, "1 hour"), (90, "90 minutes")],
    )
    def test_format_lead_time(self, minutes, expected):
        assert format_lead_time(minutes) == expected

    def test_appointment_template(self):
        title, body = appointment_upcoming_template(
            {
                "title": "Cardiology",
                "scheduled_at_local": "2030-03-11 10:00",
                "offset_minutes": 1440,
                "location": "Room 2",
                "practitioner_name": "Dr. Rossi",
            }
        )
        assert title == "Upcoming appointment: Cardiology"
        assert "2030-03-11 10:00 (in 1 day)" in body
        assert "Dr. Rossi" in body and "Room 2" in body

    def test_prescription_template(self):
        title, body = prescription_expiring_template(
            {"title": "MRI", "expiry_date": "2030-03-11", "days_before": 1, "prescription_number": "X1"}
        )
        assert title == "Prescription expiring: MRI"
        assert "expires tomorrow (2030-03-11)" in body
        assert "X1" in body

    def test_payment_template(self):
        title, body = payment_due_template(
            {"description": "Physio", "amount": "45.50", "currency": "EUR", "due_date": "2030-03-13", "days_before": 3}
        )
        assert title == "Payment due: Physio"
        assert "45.50 EUR is due in 3 days (2030-03-13)" in body

    def test_events_registered(self):
        from app.core.events import register_all_events
        from app.core.events.registry import get_event_registry

        register_all_events()
        registry = get_event_registry()
        for event_type in ("appointment_upcoming", "prescription_expiring", "payment_due"):
            assert registry.get_template(event_type, {})[0]
