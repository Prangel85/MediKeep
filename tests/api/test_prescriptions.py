"""Tests for the Prescription API endpoints."""

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.utils.datetime_utils import get_facility_timezone
from app.crud.activity_log import activity_log as activity_log_crud
from app.crud.patient import patient as patient_crud
from app.models.activity_log import EntityType
from app.models.clinical import Medication
from app.models.scheduling import Appointment, Prescription
from app.schemas.patient import PatientCreate
from tests.utils.user import create_random_user, create_user_token_headers

URL = "/api/v1/prescriptions/"


def _today() -> date:
    return datetime.now(get_facility_timezone()).date()


def _payload(patient_id: int, **overrides):
    data = {
        "title": "Blood tests",
        "prescription_type": "exam",
        "issued_date": (_today() - timedelta(days=2)).isoformat(),
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
            gender="F",
        ),
    )
    user_data["user"].active_patient_id = patient.id
    db_session.commit()
    return patient, create_user_token_headers(user_data["user"].username)


def _appointment(db_session: Session, patient_id: int) -> Appointment:
    obj = Appointment(
        patient_id=patient_id, title="Visit", scheduled_at=datetime(2030, 1, 1, 9, 0)
    )
    db_session.add(obj)
    db_session.commit()
    return obj


class TestPrescriptionsCrud:
    def test_create_with_generic_fields(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        response = client.post(
            URL,
            json=_payload(
                patient_id,
                prescription_number="1234567890ABCDE",
                priority="B",
                exemption_code="E01",
                expiry_date=(_today() + timedelta(days=30)).isoformat(),
                items=[
                    {"description": "Complete blood count", "code": "90.62.2", "quantity": 1},
                    {"description": "Glucose"},
                ],
                tags=["routine"],
            ),
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "active"
        assert data["priority"] == "B"
        assert data["exemption_code"] == "E01"
        assert data["expiry_reminder_days"] == [7, 1]
        assert data["items"][0] == {
            "description": "Complete blood count",
            "code": "90.62.2",
            "quantity": 1,
        }
        assert data["items"][1]["code"] is None

    def test_create_logs_activity(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        prescription_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        assert (
            len(
                activity_log_crud.get_by_entity(
                    db_session,
                    entity_type=EntityType.PRESCRIPTION,
                    entity_id=prescription_id,
                )
            )
            == 1
        )

    def test_list_newest_first_and_filters(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        old = client.post(
            URL,
            json=_payload(
                patient_id,
                issued_date=(_today() - timedelta(days=20)).isoformat(),
                prescription_type="medication",
            ),
            headers=authenticated_headers,
        ).json()
        new = client.post(URL, json=_payload(patient_id), headers=authenticated_headers).json()

        response = client.get(URL, headers=authenticated_headers)
        assert [p["id"] for p in response.json()] == [new["id"], old["id"]]

        response = client.get(
            URL, params={"prescription_type": "medication"}, headers=authenticated_headers
        )
        assert [p["id"] for p in response.json()] == [old["id"]]

    def test_get_update_delete(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        prescription_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        assert client.get(f"{URL}{prescription_id}", headers=authenticated_headers).status_code == 200

        response = client.put(
            f"{URL}{prescription_id}",
            json={"exemption_code": "048"},
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["exemption_code"] == "048"
        assert response.json()["title"] == "Blood tests"

        assert client.delete(f"{URL}{prescription_id}", headers=authenticated_headers).status_code == 200
        assert client.get(f"{URL}{prescription_id}", headers=authenticated_headers).status_code == 404

    def test_marking_used_records_today(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        prescription_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        response = client.put(
            f"{URL}{prescription_id}", json={"status": "used"}, headers=authenticated_headers
        )
        assert response.status_code == 200, response.text
        assert response.json()["used_date"] == _today().isoformat()


class TestPrescriptionValidation:
    def test_expiry_before_issue_rejected_on_create(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        response = client.post(
            URL,
            json=_payload(
                patient_id,
                issued_date="2026-01-10",
                expiry_date="2026-01-01",
            ),
            headers=authenticated_headers,
        )
        assert response.status_code == 422

    def test_expiry_before_stored_issue_rejected_on_update(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        prescription_id = client.post(
            URL, json=_payload(patient_id, issued_date="2026-01-10"), headers=authenticated_headers
        ).json()["id"]
        response = client.put(
            f"{URL}{prescription_id}",
            json={"expiry_date": "2026-01-01"},
            headers=authenticated_headers,
        )
        assert response.status_code == 422

    def test_future_issue_date_rejected(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        response = client.post(
            URL,
            json=_payload(patient_id, issued_date=(_today() + timedelta(days=5)).isoformat()),
            headers=authenticated_headers,
        )
        assert response.status_code == 422

    def test_rejects_unknown_type_and_bad_items(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        assert client.post(
            URL, json=_payload(patient_id, prescription_type="magic"), headers=authenticated_headers
        ).status_code == 422
        assert client.post(
            URL, json=_payload(patient_id, items=[{"description": ""}]), headers=authenticated_headers
        ).status_code == 422
        assert client.post(
            URL,
            json=_payload(patient_id, items=[{"description": "x", "quantity": 0}]),
            headers=authenticated_headers,
        ).status_code == 422


class TestExpiring:
    def test_only_active_within_window(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id

        def create(expiry_days, **kw):
            return client.post(
                URL,
                json=_payload(
                    patient_id,
                    expiry_date=(_today() + timedelta(days=expiry_days)).isoformat(),
                    **kw,
                ),
                headers=authenticated_headers,
            ).json()["id"]

        soon = create(3)
        create(5, status="used")
        create(60)
        later = create(20)

        response = client.get(f"{URL}expiring", headers=authenticated_headers)
        assert response.status_code == 200, response.text
        assert [p["id"] for p in response.json()] == [soon, later]


class TestLinks:
    def test_link_own_appointment_and_medication(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appt = _appointment(db_session, patient_id)
        med = Medication(patient_id=patient_id, medication_name="Drug")
        db_session.add(med)
        db_session.commit()

        response = client.post(
            URL,
            json=_payload(patient_id, appointment_id=appt.id, medication_id=med.id),
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text

        response = client.get(URL, params={"appointment_id": appt.id}, headers=authenticated_headers)
        assert len(response.json()) == 1

    def test_reject_other_patients_appointment(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        other_patient, _ = _user_with_patient(db_session, "Other")
        foreign = _appointment(db_session, other_patient.id)

        response = client.post(
            URL, json=_payload(patient_id, appointment_id=foreign.id), headers=authenticated_headers
        )
        assert response.status_code == 404

        prescription_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        response = client.put(
            f"{URL}{prescription_id}",
            json={"appointment_id": foreign.id},
            headers=authenticated_headers,
        )
        assert response.status_code == 404

    def test_deleting_appointment_keeps_prescription(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appt = _appointment(db_session, patient_id)
        prescription_id = client.post(
            URL, json=_payload(patient_id, appointment_id=appt.id), headers=authenticated_headers
        ).json()["id"]

        assert client.delete(
            f"/api/v1/appointments/{appt.id}", headers=authenticated_headers
        ).status_code == 200
        db_session.expire_all()
        remaining = db_session.get(Prescription, prescription_id)
        assert remaining is not None
        assert remaining.appointment_id is None


class TestIsolation:
    def test_other_user_cannot_access(self, client: TestClient, db_session: Session):
        patient1, headers1 = _user_with_patient(db_session, "One")
        _, headers2 = _user_with_patient(db_session, "Two")
        prescription_id = client.post(
            URL, json=_payload(patient1.id), headers=headers1
        ).json()["id"]

        assert client.get(f"{URL}{prescription_id}", headers=headers2).status_code == 404
        assert client.put(
            f"{URL}{prescription_id}", json={"title": "Hacked"}, headers=headers2
        ).status_code == 404
        assert client.delete(f"{URL}{prescription_id}", headers=headers2).status_code == 404
        assert client.get(URL, headers=headers2).json() == []
        assert client.get(f"{URL}expiring", headers=headers2).json() == []

    def test_deleting_patient_deletes_prescriptions(
        self, db_session: Session, user_with_patient
    ):
        from app.services.patient_management import PatientManagementService

        patient = user_with_patient["patient"]
        db_session.add(
            Prescription(
                patient_id=patient.id,
                title="Check",
                prescription_type="exam",
                issued_date=date(2026, 1, 1),
            )
        )
        db_session.commit()
        PatientManagementService(db_session).delete_patient(
            user_with_patient["user"], patient.id
        )
        assert db_session.query(Prescription).count() == 0
