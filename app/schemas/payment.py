"""Schemas for healthcare Payments."""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
)

from app.models.scheduling import (
    DEFAULT_PAYMENT_DUE_REMINDER_DAYS,
    get_all_payment_methods,
    get_all_payment_statuses,
    get_all_payment_types,
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

MAX_AMOUNT = Decimal("99999999.99")  # Numeric(10, 2)


def validate_currency(v: Optional[str]) -> Optional[str]:
    """ISO 4217 alphabetic code, e.g. EUR, USD."""
    if v is None:
        return None
    code = v.strip().upper()
    if len(code) != 3 or not code.isalpha() or not code.isascii():
        raise ValueError("Currency must be a 3-letter ISO 4217 code (e.g. EUR)")
    return code


def validate_due_reminder_days(v: Optional[List[int]]) -> Optional[List[int]]:
    return validate_int_list(
        v, minimum=1, maximum=365, max_items=10, label="due reminder days"
    )


class _PaymentValidators(BaseModel):
    """Shared write-path validators for Create and Update."""

    @field_validator("description", check_fields=False)
    @classmethod
    def validate_description(cls, v):
        if v is None:
            return None
        return validate_required_text(
            v, max_length=200, min_length=2, field_name="Description"
        )

    @field_validator("currency", check_fields=False)
    @classmethod
    def validate_currency_code(cls, v):
        return validate_currency(v)

    @field_validator("payment_type", check_fields=False)
    @classmethod
    def validate_type(cls, v):
        return validate_choice(v, get_all_payment_types(), "Payment type")

    @field_validator("status", check_fields=False)
    @classmethod
    def validate_status(cls, v):
        return validate_choice(v, get_all_payment_statuses(), "Status")

    @field_validator("payment_method", check_fields=False)
    @classmethod
    def validate_method(cls, v):
        return validate_choice(v, get_all_payment_methods(), "Payment method")

    @field_validator("payee", check_fields=False)
    @classmethod
    def validate_payee(cls, v):
        return validate_text_field(v, max_length=200, field_name="Payee")

    @field_validator("reference_number", check_fields=False)
    @classmethod
    def validate_reference(cls, v):
        return validate_text_field(v, max_length=100, field_name="Reference number")

    @field_validator("notes", check_fields=False)
    @classmethod
    def validate_notes(cls, v):
        return validate_text_field(v, max_length=5000, field_name="Notes")

    @field_validator("paid_date", check_fields=False)
    @classmethod
    def validate_paid(cls, v):
        return validate_date_not_future(v, field_name="Paid date")

    @field_validator(
        "appointment_id", "prescription_id", "practice_id", check_fields=False
    )
    @classmethod
    def validate_optional_ids(cls, v):
        return validate_positive_id(v, field_name="ID", required=False)

    @field_validator("due_reminder_days", check_fields=False)
    @classmethod
    def validate_reminder_days(cls, v):
        return validate_due_reminder_days(v)


class PaymentBase(TaggedEntityMixin):
    """Field declarations only; validators live on Create/Update so reads stay lenient."""

    description: str = Field(..., max_length=200)
    amount: Decimal = Field(..., ge=0, le=MAX_AMOUNT, decimal_places=2)
    currency: str = Field(..., max_length=3, description="ISO 4217 code, e.g. EUR")
    payment_type: str = Field(..., max_length=30)
    status: str = Field("due", max_length=20)
    due_date: Optional[date] = None
    paid_date: Optional[date] = None
    payment_method: Optional[str] = Field(None, max_length=30)
    reference_number: Optional[str] = Field(None, max_length=100)
    payee: Optional[str] = Field(None, max_length=200)
    tax_deductible: bool = False
    notes: Optional[str] = Field(None, max_length=5000)
    reminder_enabled: bool = True
    due_reminder_days: Optional[List[int]] = Field(
        default_factory=lambda: list(DEFAULT_PAYMENT_DUE_REMINDER_DAYS),
        description="Warn this many days before the due date while unpaid",
    )
    appointment_id: Optional[int] = None
    prescription_id: Optional[int] = None
    practice_id: Optional[int] = None
    patient_id: int = Field(..., gt=0, description="ID of the patient")


class PaymentCreate(_PaymentValidators, PaymentBase):
    """Schema for creating a payment."""


class PaymentUpdate(_PaymentValidators, TaggedEntityUpdateMixin):
    """Schema for updating a payment (partial)."""

    description: Optional[str] = Field(None, max_length=200)
    amount: Optional[Decimal] = Field(None, ge=0, le=MAX_AMOUNT, decimal_places=2)
    currency: Optional[str] = Field(None, max_length=3)
    payment_type: Optional[str] = Field(None, max_length=30)
    status: Optional[str] = Field(None, max_length=20)
    due_date: Optional[date] = None
    paid_date: Optional[date] = None
    payment_method: Optional[str] = Field(None, max_length=30)
    reference_number: Optional[str] = Field(None, max_length=100)
    payee: Optional[str] = Field(None, max_length=200)
    tax_deductible: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=5000)
    reminder_enabled: Optional[bool] = None
    due_reminder_days: Optional[List[int]] = None
    appointment_id: Optional[int] = None
    prescription_id: Optional[int] = None
    practice_id: Optional[int] = None

    @field_validator(
        "description",
        "amount",
        "currency",
        "payment_type",
        "status",
        "tax_deductible",
        "reminder_enabled",
    )
    @classmethod
    def reject_explicit_null(cls, v, info):
        # NOT NULL columns: omit to leave unchanged; explicit null is an error.
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class PaymentResponse(TaggedEntityResponseMixin, PaymentBase):
    """Schema for payment responses."""

    id: int
    amount: Decimal
    due_reminder_days: Optional[List[int]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("amount")
    @classmethod
    def serialize_amount(cls, value: Decimal) -> float:
        # A JSON number is easier for clients than pydantic's default string.
        return float(value)

    @field_serializer("created_at", "updated_at")
    @classmethod
    def serialize_datetime_as_utc(cls, value: Optional[datetime]) -> Optional[str]:
        return serialize_datetime_utc(value)


class PaymentSummary(BaseModel):
    """Totals per currency for a patient, e.g. for tax return preparation."""

    currency: str
    total_paid: float
    total_due: float
    total_tax_deductible_paid: float
    count: int

