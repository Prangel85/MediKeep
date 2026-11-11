"""Tests for the scheduled Appointment API endpoints."""

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.crud.activity_log import activity_log as activity_log_crud
from app.crud.patient import patient as patient_crud
from app.models.activity_log import EntityType
from app.models.clinical import Encounter
from app.models.scheduling import Appointment
from app.schemas.patient import PatientCreate
from tests.utils.user import create_random_user, create_user_token_headers

URL = "/api/v1/appointments/"


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _in_days(days: float) -> datetime:
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(microsecond=0)


def _payload(patient_id: int, **overrides):
    data = {
        "title": "Cardiology check-up",
        "appointment_type": "visit",
        "scheduled_at": _iso_utc(_in_days(10)),
        "patient_id": patient_id,
    }
    data.update(overrides)
    return data


def _user_with_patient(db_session: Session, first_name: str):
    user_data = create_random_user(db_session)
    patient = patient_crud.create_for_user(
        db_session,
        user_id=user_data["user"].id,
        patient_data=PatientCreate(
            first_name=first_name,
            last_name="Patient",
            birth_date=date(1990, 1, 1),
            gender="M",
        ),
    )
    user_data["user"].active_patient_id = patient.id
    db_session.commit()
    return patient, create_user_token_headers(user_data["user"].username)


class TestAppointmentsCrud:
    def test_create_defaults(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        scheduled = _in_days(10)
        response = client.post(
            URL,
            json=_payload(
                patient_id,
                scheduled_at=_iso_utc(scheduled),
                location="Hospital, floor 2",
                tags=["cardio"],
            ),
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "scheduled"
        assert data["reminder_enabled"] is True
        # Default lead times: 7 days, 1 day, 2 hours (longest first)
        assert data["reminder_offsets_minutes"] == [10080, 1440, 120]
        assert data["encounter_id"] is None
        assert data["tags"] == ["cardio"]
        # Returned as explicit UTC
        returned = datetime.fromisoformat(data["scheduled_at"])
        assert returned.tzinfo is not None
        assert returned == scheduled

    def test_naive_datetime_is_facility_local(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        from app.core.utils.datetime_utils import to_utc

        patient_id = user_with_patient["patient"].id
        response = client.post(
            URL,
            json=_payload(patient_id, scheduled_at="2030-03-01T09:30:00"),
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        expected = to_utc("2030-03-01T09:30:00")
        returned = datetime.fromisoformat(response.json()["scheduled_at"])
        assert returned == expected

    def test_create_logs_activity(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appointment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        activities = activity_log_crud.get_by_entity(
            db_session, entity_type=EntityType.APPOINTMENT, entity_id=appointment_id
        )
        assert len(activities) == 1

    def test_list_soonest_first_and_filters(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        later = client.post(
            URL,
            json=_payload(patient_id, title="Later", scheduled_at=_iso_utc(_in_days(20))),
            headers=authenticated_headers,
        ).json()
        sooner = client.post(
            URL,
            json=_payload(
                patient_id,
                title="Sooner",
                scheduled_at=_iso_utc(_in_days(2)),
                status="confirmed",
            ),
            headers=authenticated_headers,
        ).json()

        response = client.get(URL, headers=authenticated_headers)
        assert response.status_code == 200
        assert [a["id"] for a in response.json()] == [sooner["id"], later["id"]]

        response = client.get(URL, params={"status": "confirmed"}, headers=authenticated_headers)
        assert [a["id"] for a in response.json()] == [sooner["id"]]

        response = client.get(
            URL, params={"start": _iso_utc(_in_days(10))}, headers=authenticated_headers
        )
        assert [a["id"] for a in response.json()] == [later["id"]]

    def test_get_update_delete(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appointment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]

        assert client.get(f"{URL}{appointment_id}", headers=authenticated_headers).status_code == 200

        response = client.put(
            f"{URL}{appointment_id}",
            json={"status": "confirmed", "reminder_offsets_minutes": [60, 1440, 60]},
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "confirmed"
        assert response.json()["reminder_offsets_minutes"] == [1440, 60]
        # Untouched fields stay as they were
        assert response.json()["title"] == "Cardiology check-up"

        assert client.delete(f"{URL}{appointment_id}", headers=authenticated_headers).status_code == 200
        assert client.get(f"{URL}{appointment_id}", headers=authenticated_headers).status_code == 404


class TestAppointmentValidation:
    def test_rejects_unknown_status_and_type(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        assert client.post(
            URL, json=_payload(patient_id, status="maybe"), headers=authenticated_headers
        ).status_code == 422
        assert client.post(
            URL, json=_payload(patient_id, appointment_type="party"), headers=authenticated_headers
        ).status_code == 422

    def test_rejects_bad_reminder_offsets(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        for offsets in ([0], [-5], [60 * 24 * 61], list(range(1, 13))):
            response = client.post(
                URL,
                json=_payload(patient_id, reminder_offsets_minutes=offsets),
                headers=authenticated_headers,
            )
            assert response.status_code == 422, offsets

    def test_update_rejects_explicit_null_required_fields(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appointment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        for field in ("title", "scheduled_at", "status"):
            response = client.put(
                f"{URL}{appointment_id}", json={field: None}, headers=authenticated_headers
            )
            assert response.status_code == 422, field


class TestUpcoming:
    def test_only_active_future_within_window(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id

        def create(**kw):
            return client.post(
                URL, json=_payload(patient_id, **kw), headers=authenticated_headers
            ).json()["id"]

        soon = create(scheduled_at=_iso_utc(_in_days(1)))
        confirmed = create(scheduled_at=_iso_utc(_in_days(3)), status="confirmed")
        create(scheduled_at=_iso_utc(_in_days(2)), status="cancelled")
        create(scheduled_at=_iso_utc(_in_days(-1)))  # past
        create(scheduled_at=_iso_utc(_in_days(60)))  # outside default 30 days

        response = client.get(f"{URL}upcoming", headers=authenticated_headers)
        assert response.status_code == 200, response.text
        assert [a["id"] for a in response.json()] == [soon, confirmed]

        response = client.get(f"{URL}upcoming", params={"days": 90}, headers=authenticated_headers)
        assert len(response.json()) == 3


class TestComplete:
    def test_complete_creates_encounter(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appointment_id = client.post(
            URL,
            json=_payload(patient_id, location="Room 4", duration_minutes=30),
            headers=authenticated_headers,
        ).json()["id"]

        response = client.post(
            f"{URL}{appointment_id}/complete",
            json={"notes": "All fine"},
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "completed"
        assert data["encounter_id"] is not None

        visit = db_session.get(Encounter, data["encounter_id"])
        assert visit.patient_id == patient_id
        assert visit.reason == "Cardiology check-up"
        assert visit.location == "Room 4"
        assert visit.duration_minutes == 30
        assert visit.notes == "All fine"
        # Completed ahead of schedule: the visit is dated today, not in the future
        assert visit.date <= datetime.now(timezone.utc).date() + timedelta(days=1)

    def test_complete_past_appointment_keeps_its_date(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        from app.core.utils.datetime_utils import to_local

        patient_id = user_with_patient["patient"].id
        scheduled = _in_days(-5)
        appointment_id = client.post(
            URL,
            json=_payload(patient_id, scheduled_at=_iso_utc(scheduled)),
            headers=authenticated_headers,
        ).json()["id"]
        data = client.post(
            f"{URL}{appointment_id}/complete", json={}, headers=authenticated_headers
        ).json()
        visit = db_session.get(Encounter, data["encounter_id"])
        assert visit.date == to_local(scheduled).date()

    def test_complete_links_existing_encounter(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        visit = Encounter(patient_id=patient_id, reason="Existing visit", date=date.today())
        db_session.add(visit)
        db_session.commit()
        appointment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]

        response = client.post(
            f"{URL}{appointment_id}/complete",
            json={"encounter_id": visit.id},
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["encounter_id"] == visit.id
        assert db_session.query(Encounter).filter_by(patient_id=patient_id).count() == 1

    def test_complete_twice_conflicts(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appointment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        assert client.post(
            f"{URL}{appointment_id}/complete", json={}, headers=authenticated_headers
        ).status_code == 200
        assert client.post(
            f"{URL}{appointment_id}/complete", json={}, headers=authenticated_headers
        ).status_code == 409

    def test_cancelled_cannot_be_completed(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appointment_id = client.post(
            URL, json=_payload(patient_id, status="cancelled"), headers=authenticated_headers
        ).json()["id"]
        response = client.post(
            f"{URL}{appointment_id}/complete", json={}, headers=authenticated_headers
        )
        assert response.status_code == 400

    def test_cannot_link_other_patients_encounter(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        other_patient, _ = _user_with_patient(db_session, "Other")
        foreign_visit = Encounter(
            patient_id=other_patient.id, reason="Not yours", date=date.today()
        )
        db_session.add(foreign_visit)
        db_session.commit()
        appointment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]

        response = client.post(
            f"{URL}{appointment_id}/complete",
            json={"encounter_id": foreign_visit.id},
            headers=authenticated_headers,
        )
        assert response.status_code == 404
        assert db_session.get(Appointment, appointment_id).status == "scheduled"


class TestIsolation:
    def test_other_user_cannot_access(self, client: TestClient, db_session: Session):
        patient1, headers1 = _user_with_patient(db_session, "One")
        _, headers2 = _user_with_patient(db_session, "Two")
        appointment_id = client.post(
            URL, json=_payload(patient1.id), headers=headers1
        ).json()["id"]

        assert client.get(f"{URL}{appointment_id}", headers=headers2).status_code == 404
        assert client.put(
            f"{URL}{appointment_id}", json={"title": "Hacked"}, headers=headers2
        ).status_code == 404
        assert client.post(
            f"{URL}{appointment_id}/complete", json={}, headers=headers2
        ).status_code == 404
        assert client.delete(f"{URL}{appointment_id}", headers=headers2).status_code == 404
        assert client.get(URL, headers=headers2).json() == []

    def test_create_rejects_other_users_patient_id(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        other_patient, _ = _user_with_patient(db_session, "Other")
        response = client.post(
            URL, json=_payload(other_patient.id), headers=authenticated_headers
        )
        assert response.status_code == 404

    def test_deleting_patient_deletes_appointments(
        self, db_session: Session, user_with_patient
    ):
        patient = user_with_patient["patient"]
        db_session.add(
            Appointment(
                patient_id=patient.id,
                title="Check",
                scheduled_at=datetime(2030, 1, 1, 9, 0),
            )
        )
        db_session.commit()

        from app.services.patient_management import PatientManagementService

        PatientManagementService(db_session).delete_patient(
            user_with_patient["user"], patient.id
        )
        assert db_session.query(Appointment).count() == 0
