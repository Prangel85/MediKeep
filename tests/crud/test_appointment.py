"""CRUD tests for scheduled Appointments."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.crud.appointment import appointment as appointment_crud
from app.crud.patient import patient as patient_crud
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate
from app.schemas.patient import PatientCreate
from tests.utils.user import create_random_user


def _patient(db_session: Session):
    user = create_random_user(db_session)["user"]
    return patient_crud.create_for_user(
        db_session,
        user_id=user.id,
        patient_data=PatientCreate(
            first_name="Crud", last_name="Test", birth_date=date(1980, 1, 1), gender="F"
        ),
    )


def test_scheduled_at_stored_as_naive_utc(db_session: Session):
    patient = _patient(db_session)
    aware = datetime(2030, 6, 1, 12, 0, tzinfo=timezone(timedelta(hours=2)))
    obj = appointment_crud.create(
        db_session,
        obj_in=AppointmentCreate(title="Eye exam", scheduled_at=aware, patient_id=patient.id),
    )
    db_session.refresh(obj)
    assert obj.scheduled_at.tzinfo is None
    assert obj.scheduled_at == datetime(2030, 6, 1, 10, 0)

    updated = appointment_crud.update(
        db_session,
        db_obj=obj,
        obj_in=AppointmentUpdate(scheduled_at="2030-06-02T08:00:00Z"),
    )
    assert updated.scheduled_at == datetime(2030, 6, 2, 8, 0)


def test_get_upcoming_uses_given_now(db_session: Session):
    patient = _patient(db_session)
    for title, when, status in [
        ("In window", datetime(2030, 1, 5, 9, 0), "scheduled"),
        ("Too far", datetime(2030, 3, 1, 9, 0), "scheduled"),
        ("Done", datetime(2030, 1, 3, 9, 0), "completed"),
        ("Past", datetime(2029, 12, 31, 9, 0), "confirmed"),
    ]:
        appointment_crud.create(
            db_session,
            obj_in=AppointmentCreate(
                title=title,
                scheduled_at=when.replace(tzinfo=timezone.utc),
                status=status,
                patient_id=patient.id,
            ),
        )

    results = appointment_crud.get_upcoming(
        db_session,
        patient_id=patient.id,
        days=30,
        now=datetime(2030, 1, 1, tzinfo=timezone.utc),
    )
    assert [a.title for a in results] == ["In window"]
