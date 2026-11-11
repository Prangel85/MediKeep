"""Schemas for Prescriptions / referrals."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.models.scheduling import (
    DEFAULT_PRESCRIPTION_EXPIRY_REMINDER_DAYS,
    get_all_prescription_statuses,
    get_all_prescription_types,
)
from app.schemas.base_tags import (
    TaggedEntityMixin,
    TaggedEntityResponseMixin,
    TaggedEntityUpdateMixin,
)
from app.schemas.scheduling_common import (
    serialize_datetime_utc,
    validate_choice,
    validate_int_list,
)
from app.schemas.validators import (
    validate_date_not_future,
    validate_positive_id,
    validate_required_text,
    validate_text_field,
)

MAX_ITEMS = 50
MAX_EXPIRY_REMINDER_DAYS = 365


class PrescriptionItem(BaseModel):
    """A single prescribed item: a medication, an exam, a visit, ..."""

    description: str = Field(..., max_length=300)
    code: Optional[str] = Field(None, max_length=50, description="e.g. catalogue code")
    quantity: Optional[int] = Field(None, ge=1, le=999)

    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        return validate_required_text(v, max_length=300, field_name="Description")

    @field_validator("code")
    @classmethod
    def validate_code(cls, v):
        return validate_text_field(v, max_length=50, field_name="Code")


def validate_expiry_reminder_days(v: Optional[List[int]]) -> Optional[List[int]]:
    return validate_int_list(
        v,
        minimum=1,
        maximum=MAX_EXPIRY_REMINDER_DAYS,
        max_items=10,
        label="expiry reminder days",
    )


def validate_prescription_dates(
    issued: Optional[date], expiry: Optional[date], used: Optional[date]
) -> None:
    """Expiry and use cannot precede issue. Shared with the CRUD merged-state check."""
    if issued is None:
        return
    if expiry is not None and expiry < issued:
        raise ValueError("Expiry date cannot be before the issue date")
    if used is not None and used < issued:
        raise ValueError("Used date cannot be before the issue date")


class _PrescriptionValidators(BaseModel):
    """Shared write-path validators for Create and Update."""

    @field_validator("title", check_fields=False)
    @classmethod
    def validate_title(cls, v):
        if v is None:
            return None
        return validate_required_text(v, max_length=200, min_length=2, field_name="Title")

    @field_validator("prescription_type", check_fields=False)
    @classmethod
    def validate_type(cls, v):
        return validate_choice(v, get_all_prescription_types(), "Prescription type")

    @field_validator("status", check_fields=False)
    @classmethod
    def validate_status(cls, v):
        return validate_choice(v, get_all_prescription_statuses(), "Status")

    @field_validator("prescription_number", check_fields=False)
    @classmethod
    def validate_number(cls, v):
        return validate_text_field(v, max_length=100, field_name="Prescription number")

    @field_validator("priority", check_fields=False)
    @classmethod
    def validate_priority(cls, v):
        return validate_text_field(v, max_length=30, field_name="Priority")

    @field_validator("exemption_code", check_fields=False)
    @classmethod
    def validate_exemption(cls, v):
        return validate_text_field(v, max_length=50, field_name="Exemption code")

    @field_validator("notes", check_fields=False)
    @classmethod
    def validate_notes(cls, v):
        return validate_text_field(v, max_length=5000, field_name="Notes")

    @field_validator("issued_date", check_fields=False)
    @classmethod
    def validate_issued(cls, v):
        return validate_date_not_future(v, field_name="Issue date")

    @field_validator("used_date", check_fields=False)
    @classmethod
    def validate_used(cls, v):
        return validate_date_not_future(v, field_name="Used date")

    @field_validator(
        "practitioner_id", "appointment_id", "medication_id", check_fields=False
    )
    @classmethod
    def validate_optional_ids(cls, v):
        return validate_positive_id(v, field_name="ID", required=False)

    @field_validator("expiry_reminder_days", check_fields=False)
    @classmethod
    def validate_reminder_days(cls, v):
        return validate_expiry_reminder_days(v)

    @field_validator("items", check_fields=False)
    @classmethod
    def validate_items(cls, v):
        if v is not None and len(v) > MAX_ITEMS:
            raise ValueError(f"At most {MAX_ITEMS} items are allowed")
        return v


class PrescriptionBase(TaggedEntityMixin):
    """Field declarations only; validators live on Create/Update so reads stay lenient."""

    title: str = Field(..., max_length=200)
    prescription_type: str = Field(..., max_length=30)
    prescription_number: Optional[str] = Field(
        None, max_length=100, description="Prescription identifier (e.g. Italian NRE)"
    )
    issued_date: date
    expiry_date: Optional[date] = None
    priority: Optional[str] = Field(
        None, max_length=30, description="Priority class (e.g. Italian U/B/D/P)"
    )
    exemption_code: Optional[str] = Field(None, max_length=50)
    items: Optional[List[PrescriptionItem]] = None
    status: str = Field("active", max_length=20)
    used_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=5000)
    reminder_enabled: bool = True
    expiry_reminder_days: Optional[List[int]] = Field(
        default_factory=lambda: list(DEFAULT_PRESCRIPTION_EXPIRY_REMINDER_DAYS),
        description="Warn this many days before the expiry date while unused",
    )
    practitioner_id: Optional[int] = None
    appointment_id: Optional[int] = None
    medication_id: Optional[int] = None
    patient_id: int = Field(..., gt=0, description="ID of the patient")


class PrescriptionCreate(_PrescriptionValidators, PrescriptionBase):
    """Schema for creating a prescription."""

    @model_validator(mode="after")
    def validate_dates(self):
        validate_prescription_dates(self.issued_date, self.expiry_date, self.used_date)
        return self


class PrescriptionUpdate(_PrescriptionValidators, TaggedEntityUpdateMixin):
    """Schema for updating a prescription (partial)."""

    title: Optional[str] = Field(None, max_length=200)
    prescription_type: Optional[str] = Field(None, max_length=30)
    prescription_number: Optional[str] = Field(None, max_length=100)
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    priority: Optional[str] = Field(None, max_length=30)
    exemption_code: Optional[str] = Field(None, max_length=50)
    items: Optional[List[PrescriptionItem]] = None
    status: Optional[str] = Field(None, max_length=20)
    used_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=5000)
    reminder_enabled: Optional[bool] = None
    expiry_reminder_days: Optional[List[int]] = None
    practitioner_id: Optional[int] = None
    appointment_id: Optional[int] = None
    medication_id: Optional[int] = None

    @field_validator(
        "title", "prescription_type", "issued_date", "status", "reminder_enabled"
    )
    @classmethod
    def reject_explicit_null(cls, v, info):
        # NOT NULL columns: omit to leave unchanged; explicit null is an error.
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class PrescriptionResponse(TaggedEntityResponseMixin, PrescriptionBase):
    """Schema for prescription responses."""

    id: int
    expiry_reminder_days: Optional[List[int]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at", "updated_at")
    @classmethod
    def serialize_datetime_as_utc(cls, value: Optional[datetime]) -> Optional[str]:
        return serialize_datetime_utc(value)
