"""Unit tests for the Prescription schemas."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionItem,
    PrescriptionUpdate,
    validate_expiry_reminder_days,
)


def _create(**overrides):
    data = {
        "title": "Referral",
        "prescription_type": "referral",
        "issued_date": "2026-01-10",
        "patient_id": 1,
    }
    data.update(overrides)
    return PrescriptionCreate(**data)


class TestPrescriptionCreate:
    def test_defaults(self):
        obj = _create()
        assert obj.status == "active"
        assert obj.reminder_enabled is True
        assert obj.expiry_reminder_days == [7, 1]
        assert obj.items is None

    def test_country_specific_values_are_free_text(self):
        obj = _create(prescription_number=" 1500A4001234567 ", priority="U", exemption_code="048")
        assert obj.prescription_number == "1500A4001234567"
        assert obj.priority == "U"

    def test_normalizes_type_and_status(self):
        obj = _create(prescription_type=" EXAM ", status="Used", used_date="2026-01-12")
        assert obj.prescription_type == "exam"
        assert obj.status == "used"

    @pytest.mark.parametrize(
        "overrides",
        [
            {"expiry_date": "2026-01-09"},
            {"used_date": "2026-01-09"},
            {"prescription_type": "unknown"},
            {"title": "x"},
        ],
    )
    def test_rejects_invalid(self, overrides):
        with pytest.raises(ValidationError):
            _create(**overrides)

    def test_same_day_expiry_allowed(self):
        assert _create(expiry_date="2026-01-10").expiry_date == date(2026, 1, 10)

    def test_too_many_items(self):
        with pytest.raises(ValidationError):
            _create(items=[{"description": f"Item {i}"} for i in range(51)])


class TestPrescriptionItem:
    def test_strips_and_requires_description(self):
        assert PrescriptionItem(description="  CBC ").description == "CBC"
        with pytest.raises(ValidationError):
            PrescriptionItem(description="   ")


class TestExpiryReminderDays:
    def test_sorted_and_deduplicated(self):
        assert validate_expiry_reminder_days([1, 7, 1, 30]) == [30, 7, 1]

    @pytest.mark.parametrize("bad", [[0], [366], [2.5]])
    def test_rejects_invalid(self, bad):
        with pytest.raises(ValueError):
            validate_expiry_reminder_days(bad)


class TestPrescriptionUpdate:
    @pytest.mark.parametrize(
        "field", ["title", "prescription_type", "issued_date", "status", "reminder_enabled"]
    )
    def test_rejects_explicit_null(self, field):
        with pytest.raises(ValidationError):
            PrescriptionUpdate(**{field: None})

    def test_optional_links_can_be_cleared(self):
        obj = PrescriptionUpdate(appointment_id=None, expiry_date=None)
        assert obj.model_dump(exclude_unset=True) == {
            "appointment_id": None,
            "expiry_date": None,
        }
