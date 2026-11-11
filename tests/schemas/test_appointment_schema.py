"""Unit tests for the Appointment schemas."""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.appointment import (
    AppointmentComplete,
    AppointmentCreate,
    AppointmentResponse,
    AppointmentUpdate,
    validate_reminder_offsets,
)


def _create(**overrides):
    data = {
        "title": "Dentist",
        "scheduled_at": "2030-05-01T10:00:00Z",
        "patient_id": 1,
    }
    data.update(overrides)
    return AppointmentCreate(**data)


class TestAppointmentCreate:
    def test_defaults(self):
        obj = _create()
        assert obj.status == "scheduled"
        assert obj.reminder_enabled is True
        assert obj.reminder_offsets_minutes == [10080, 1440, 120]

    def test_normalizes_choices(self):
        obj = _create(status=" Confirmed ", appointment_type="LAB_TEST")
        assert obj.status == "confirmed"
        assert obj.appointment_type == "lab_test"

    def test_title_required_and_min_length(self):
        with pytest.raises(ValidationError):
            _create(title="")
        with pytest.raises(ValidationError):
            _create(title="x")

    def test_duration_bounds(self):
        with pytest.raises(ValidationError):
            _create(duration_minutes=0)
        with pytest.raises(ValidationError):
            _create(duration_minutes=24 * 60 + 1)

    def test_empty_offsets_allowed(self):
        assert _create(reminder_offsets_minutes=[]).reminder_offsets_minutes == []


class TestReminderOffsets:
    def test_sorted_and_deduplicated(self):
        assert validate_reminder_offsets([60, 1440, 60, 5]) == [1440, 60, 5]

    @pytest.mark.parametrize("bad", [[0], [-1], [60 * 24 * 60 + 1], [True], [1.5]])
    def test_rejects_invalid(self, bad):
        with pytest.raises(ValueError):
            validate_reminder_offsets(bad)

    def test_rejects_too_many(self):
        with pytest.raises(ValueError):
            validate_reminder_offsets(list(range(1, 12)))


class TestAppointmentUpdate:
    def test_partial_update_only_sets_given_fields(self):
        obj = AppointmentUpdate(status="cancelled")
        assert obj.model_dump(exclude_unset=True) == {"status": "cancelled"}

    @pytest.mark.parametrize("field", ["title", "scheduled_at", "status", "reminder_enabled"])
    def test_rejects_explicit_null(self, field):
        with pytest.raises(ValidationError):
            AppointmentUpdate(**{field: None})

    def test_optional_fields_can_be_cleared(self):
        obj = AppointmentUpdate(location=None, practitioner_id=None)
        assert obj.model_dump(exclude_unset=True) == {
            "location": None,
            "practitioner_id": None,
        }


class TestAppointmentResponse:
    def test_naive_datetime_serialized_as_utc(self):
        resp = AppointmentResponse(
            id=1,
            patient_id=1,
            title="Dentist",
            status="scheduled",
            scheduled_at=datetime(2030, 5, 1, 10, 0),
        )
        dumped = resp.model_dump(mode="json")
        assert dumped["scheduled_at"] == "2030-05-01T10:00:00+00:00"

    def test_aware_datetime_converted_to_utc(self):
        from datetime import timedelta

        resp = AppointmentResponse(
            id=1,
            patient_id=1,
            title="Dentist",
            status="scheduled",
            scheduled_at=datetime(2030, 5, 1, 12, 0, tzinfo=timezone(timedelta(hours=2))),
        )
        assert resp.model_dump(mode="json")["scheduled_at"] == "2030-05-01T10:00:00+00:00"


class TestAppointmentComplete:
    def test_empty_body_is_valid(self):
        assert AppointmentComplete().encounter_id is None

    def test_rejects_non_positive_encounter_id(self):
        with pytest.raises(ValidationError):
            AppointmentComplete(encounter_id=0)
