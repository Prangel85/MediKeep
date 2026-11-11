"""Tests for the healthcare Payment API endpoints."""

import io
from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.utils.datetime_utils import get_facility_timezone
from app.crud.activity_log import activity_log as activity_log_crud
from app.crud.patient import patient as patient_crud
from app.models.activity_log import EntityType
from app.models.scheduling import Appointment, Payment, Prescription
from app.schemas.patient import PatientCreate
from tests.utils.user import create_random_user, create_user_token_headers

URL = "/api/v1/payments/"


def _today() -> date:
    return datetime.now(get_facility_timezone()).date()


def _payload(patient_id: int, **overrides):
    data = {
        "description": "Blood tests copay",
        "amount": "36.15",
        "currency": "eur",
        "payment_type": "copay",
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


class TestPaymentsCrud:
    def test_create_defaults(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        response = client.post(
            URL,
            json=_payload(patient_id, due_date=(_today() + timedelta(days=10)).isoformat()),
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["amount"] == 36.15
        assert data["currency"] == "EUR"
        assert data["status"] == "due"
        assert data["tax_deductible"] is False
        assert data["due_reminder_days"] == [3, 1]
        assert data["paid_date"] is None

    def test_create_paid_fills_paid_date(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        response = client.post(
            URL,
            json=_payload(
                patient_id,
                status="paid",
                payment_method="card",
                tax_deductible=True,
                reference_number="R-2026-001",
            ),
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["paid_date"] == _today().isoformat()

    def test_create_logs_activity(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        payment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        activities = activity_log_crud.get_by_entity(
            db_session, entity_type=EntityType.PAYMENT, entity_id=payment_id
        )
        assert len(activities) == 1

    def test_get_update_delete(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        payment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        assert client.get(f"{URL}{payment_id}", headers=authenticated_headers).status_code == 200

        response = client.put(
            f"{URL}{payment_id}",
            json={"status": "paid", "payment_method": "cash"},
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "paid"
        assert data["paid_date"] == _today().isoformat()
        assert data["amount"] == 36.15

        assert client.delete(f"{URL}{payment_id}", headers=authenticated_headers).status_code == 200
        assert client.get(f"{URL}{payment_id}", headers=authenticated_headers).status_code == 404

    def test_list_filters(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        deductible = client.post(
            URL,
            json=_payload(patient_id, payment_type="private", tax_deductible=True),
            headers=authenticated_headers,
        ).json()["id"]
        client.post(URL, json=_payload(patient_id), headers=authenticated_headers)

        response = client.get(URL, params={"tax_deductible": True}, headers=authenticated_headers)
        assert [p["id"] for p in response.json()] == [deductible]
        response = client.get(URL, params={"payment_type": "copay"}, headers=authenticated_headers)
        assert len(response.json()) == 1


class TestPaymentValidation:
    def test_rejects_bad_values(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        for overrides in (
            {"amount": "-1"},
            {"amount": "12.345"},
            {"amount": "100000000"},
            {"currency": "EURO"},
            {"currency": "€"},
            {"payment_type": "gift"},
            {"payment_method": "barter"},
            {"status": "maybe"},
            {"paid_date": (_today() + timedelta(days=5)).isoformat()},
        ):
            response = client.post(
                URL, json=_payload(patient_id, **overrides), headers=authenticated_headers
            )
            assert response.status_code == 422, overrides

    def test_update_rejects_explicit_null(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        payment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]
        for field in ("amount", "currency", "status", "tax_deductible"):
            response = client.put(
                f"{URL}{payment_id}", json={field: None}, headers=authenticated_headers
            )
            assert response.status_code == 422, field


class TestDueAndSummary:
    def test_due_includes_overdue_excludes_paid_and_far(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id

        def create(due_in_days, **kw):
            return client.post(
                URL,
                json=_payload(
                    patient_id,
                    due_date=(_today() + timedelta(days=due_in_days)).isoformat(),
                    **kw,
                ),
                headers=authenticated_headers,
            ).json()["id"]

        overdue = create(-3)
        soon = create(5)
        create(2, status="paid")
        create(90)

        response = client.get(f"{URL}due", headers=authenticated_headers)
        assert response.status_code == 200, response.text
        assert [p["id"] for p in response.json()] == [overdue, soon]

    def test_summary_per_currency_and_year(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        for overrides in (
            {"amount": "100.00", "status": "paid", "paid_date": "2025-03-01", "tax_deductible": True},
            {"amount": "50.50", "status": "paid", "paid_date": "2025-06-01"},
            {"amount": "20.00", "due_date": "2025-12-01"},
            {"amount": "999.00", "status": "cancelled"},
            {"amount": "10.00", "status": "paid", "paid_date": "2024-06-01"},
            {"amount": "30.00", "currency": "USD", "status": "paid", "paid_date": "2025-01-10"},
        ):
            assert client.post(
                URL, json=_payload(patient_id, **overrides), headers=authenticated_headers
            ).status_code == 200

        response = client.get(f"{URL}summary", params={"year": 2025}, headers=authenticated_headers)
        assert response.status_code == 200, response.text
        assert response.json() == [
            {
                "currency": "EUR",
                "total_paid": 150.5,
                "total_due": 20.0,
                "total_tax_deductible_paid": 100.0,
                "count": 3,
            },
            {
                "currency": "USD",
                "total_paid": 30.0,
                "total_due": 0.0,
                "total_tax_deductible_paid": 0.0,
                "count": 1,
            },
        ]

        all_years = client.get(f"{URL}summary", headers=authenticated_headers).json()
        assert all_years[0]["total_paid"] == 160.5


class TestLinksAndReceipts:
    def test_link_appointment_and_prescription(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        appt = Appointment(patient_id=patient_id, title="Visit", scheduled_at=datetime(2030, 1, 1))
        rx = Prescription(
            patient_id=patient_id, title="Rx", prescription_type="exam", issued_date=date(2026, 1, 1)
        )
        db_session.add_all([appt, rx])
        db_session.commit()

        response = client.post(
            URL,
            json=_payload(patient_id, appointment_id=appt.id, prescription_id=rx.id),
            headers=authenticated_headers,
        )
        assert response.status_code == 200, response.text
        payment_id = response.json()["id"]

        response = client.get(URL, params={"prescription_id": rx.id}, headers=authenticated_headers)
        assert [p["id"] for p in response.json()] == [payment_id]

        # Deleting the prescription keeps the payment, unlinked
        db_session.delete(rx)
        db_session.commit()
        db_session.expire_all()
        assert db_session.get(Payment, payment_id).prescription_id is None

    def test_reject_other_patients_prescription(
        self, client: TestClient, db_session: Session, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        other, _ = _user_with_patient(db_session, "Other")
        foreign = Prescription(
            patient_id=other.id, title="Rx", prescription_type="exam", issued_date=date(2026, 1, 1)
        )
        db_session.add(foreign)
        db_session.commit()
        response = client.post(
            URL, json=_payload(patient_id, prescription_id=foreign.id), headers=authenticated_headers
        )
        assert response.status_code == 404

    def test_receipt_upload(
        self, client: TestClient, user_with_patient, authenticated_headers
    ):
        patient_id = user_with_patient["patient"].id
        payment_id = client.post(
            URL, json=_payload(patient_id), headers=authenticated_headers
        ).json()["id"]

        response = client.post(
            f"/api/v1/entity-files/payment/{payment_id}/files",
            headers=authenticated_headers,
            files={"file": ("receipt.txt", io.BytesIO(b"receipt"), "text/plain")},
        )
        assert response.status_code == 201, response.text

        response = client.get(
            f"/api/v1/entity-files/payment/{payment_id}/files", headers=authenticated_headers
        )
        assert response.status_code == 200, response.text
        assert len(response.json()) == 1


class TestIsolation:
    def test_other_user_cannot_access(self, client: TestClient, db_session: Session):
        patient1, headers1 = _user_with_patient(db_session, "One")
        _, headers2 = _user_with_patient(db_session, "Two")
        payment_id = client.post(URL, json=_payload(patient1.id), headers=headers1).json()["id"]

        assert client.get(f"{URL}{payment_id}", headers=headers2).status_code == 404
        assert client.put(
            f"{URL}{payment_id}", json={"description": "Hacked"}, headers=headers2
        ).status_code == 404
        assert client.delete(f"{URL}{payment_id}", headers=headers2).status_code == 404
        assert client.get(URL, headers=headers2).json() == []
        assert client.get(f"{URL}summary", headers=headers2).json() == []
        assert client.post(
            f"/api/v1/entity-files/payment/{payment_id}/files",
            headers=headers2,
            files={"file": ("x.txt", io.BytesIO(b"x"), "text/plain")},
        ).status_code in (403, 404)

    def test_deleting_patient_deletes_payments(self, db_session: Session, user_with_patient):
        from decimal import Decimal

        from app.services.patient_management import PatientManagementService

        patient = user_with_patient["patient"]
        db_session.add(
            Payment(
                patient_id=patient.id,
                description="Visit",
                amount=Decimal("10"),
                currency="EUR",
                payment_type="private",
            )
        )
        db_session.commit()
        PatientManagementService(db_session).delete_patient(user_with_patient["user"], patient.id)
        assert db_session.query(Payment).count() == 0
