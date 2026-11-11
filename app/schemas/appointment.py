"""Schemas for scheduled Appointments."""

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from app.models.scheduling import (
    DEFAULT_APPOINTMENT_REMINDER_OFFSETS,
    get_all_appointment_statuses,
    get_all_appointment_types,
)
from app.schemas.base_tags import (
    TaggedEntityMixin,
    TaggedEntityResponseMixin,
    TaggedEntityUpdateMixin,
)
from app.schemas.validators import (
    validate_positive_id,
    validate_required_text,
    validate_text_field,
)

# Longest reminder lead time accepted: 60 days.
MAX_REMINDER_OFFSET_MINUTES = 60 * 24 * 60
MAX_REMINDER_OFFSETS = 10


def _serialize_datetime_utc(value: Optional[datetime]) -> Optional[str]:
    """Emit stored (naive UTC) datetimes as explicit UTC ISO strings."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


def _validate_choice(v: Optional[str], allowed: list, label: str) -> Optional[str]:
    if v is None:
        return None
    normalized = v.strip().lower()
    if normalized not in allowed:
        raise ValueError(f"{label} must be one of: {', '.join(allowed)}")
    return normalized


def validate_reminder_offsets(v: Optional[List[int]]) -> Optional[List[int]]:
    """Validate reminder lead times (minutes): positive, bounded, de-duplicated.

    Returned sorted from the longest lead time to the shortest.
    """
    if v is None:
        return None
    if len(v) > MAX_REMINDER_OFFSETS:
        raise ValueError(f"At most {MAX_REMINDER_OFFSETS} reminders are allowed")
    for offset in v:
        if isinstance(offset, bool) or not isinstance(offset, int):
            raise ValueError("Reminder offsets must be whole minutes")
        if offset < 1 or offset > MAX_REMINDER_OFFSET_MINUTES:
            raise ValueError(
                f"Reminder offsets must be between 1 and "
                f"{MAX_REMINDER_OFFSET_MINUTES} minutes"
            )
    return sorted(set(v), reverse=True)


class _AppointmentValidators(BaseModel):
    """Shared write-path validators for Create and Update."""

    @field_validator("title", check_fields=False)
    @classmethod
    def validate_title(cls, v):
        if v is None:
            return None
        return validate_required_text(
            v, max_length=200, min_length=2, field_name="Title"
        )

    @field_validator("appointment_type", check_fields=False)
    @classmethod
    def validate_appointment_type(cls, v):
        return _validate_choice(v, get_all_appointment_types(), "Appointment type")

    @field_validator("status", check_fields=False)
    @classmethod
    def validate_status(cls, v):
        return _validate_choice(v, get_all_appointment_statuses(), "Status")

    @field_validator("location", check_fields=False)
    @classmethod
    def validate_location(cls, v):
        return validate_text_field(v, max_length=300, field_name="Location")

    @field_validator("notes", check_fields=False)
    @classmethod
    def validate_notes(cls, v):
        return validate_text_field(v, max_length=5000, field_name="Notes")

    @field_validator("practitioner_id", "practice_id", check_fields=False)
    @classmethod
    def validate_optional_ids(cls, v):
        return validate_positive_id(v, field_name="ID", required=False)

    @field_validator("reminder_offsets_minutes", check_fields=False)
    @classmethod
    def validate_offsets(cls, v):
        return validate_reminder_offsets(v)


class AppointmentBase(TaggedEntityMixin):
    """Field declarations only; validators live on Create/Update so reads stay lenient."""

    title: str = Field(..., max_length=200)
    appointment_type: Optional[str] = Field(None, max_length=50)
    scheduled_at: datetime = Field(
        ...,
        description=(
            "Date and time of the appointment. Naive values are read as "
            "facility local time; values with an offset or 'Z' are converted to UTC."
        ),
    )
    duration_minutes: Optional[int] = Field(None, ge=1, le=24 * 60)
    location: Optional[str] = Field(None, max_length=300)
    status: str = Field("scheduled", max_length=20)
    notes: Optional[str] = Field(None, max_length=5000)
    reminder_enabled: bool = True
    reminder_offsets_minutes: Optional[List[int]] = Field(
        default_factory=lambda: list(DEFAULT_APPOINTMENT_REMINDER_OFFSETS),
        description="Reminder lead times in minutes before the appointment",
    )
    practitioner_id: Optional[int] = None
    practice_id: Optional[int] = None
    patient_id: int = Field(..., gt=0, description="ID of the patient")


class AppointmentCreate(_AppointmentValidators, AppointmentBase):
    """Schema for creating an appointment."""


class AppointmentUpdate(_AppointmentValidators, TaggedEntityUpdateMixin):
    """Schema for updating an appointment (partial)."""

    title: Optional[str] = Field(None, max_length=200)
    appointment_type: Optional[str] = Field(None, max_length=50)
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(None, ge=1, le=24 * 60)
    location: Optional[str] = Field(None, max_length=300)
    status: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=5000)
    reminder_enabled: Optional[bool] = None
    reminder_offsets_minutes: Optional[List[int]] = None
    practitioner_id: Optional[int] = None
    practice_id: Optional[int] = None

    @field_validator("title", "scheduled_at", "status", "reminder_enabled")
    @classmethod
    def reject_explicit_null(cls, v, info):
        # NOT NULL columns: omitting them leaves them unchanged, but an
        # explicit null is a client error, not a request to clear them.
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class AppointmentResponse(TaggedEntityResponseMixin, AppointmentBase):
    """Schema for appointment responses."""

    id: int
    encounter_id: Optional[int] = None
    reminder_offsets_minutes: Optional[List[int]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("scheduled_at", "created_at", "updated_at")
    @classmethod
    def serialize_datetime_as_utc(cls, value: Optional[datetime]) -> Optional[str]:
        return _serialize_datetime_utc(value)


class AppointmentComplete(BaseModel):
    """Body of ``POST /appointments/{id}/complete``.

    With ``encounter_id`` the appointment is linked to that existing visit;
    without it a new visit (Encounter) is created from the appointment data.
    """

    encounter_id: Optional[int] = Field(None, gt=0)
    notes: Optional[str] = Field(
        None, max_length=5000, description="Notes for the newly created visit"
    )

    @field_validator("notes")
    @classmethod
    def validate_notes(cls, v):
        return validate_text_field(v, max_length=5000, field_name="Notes")
