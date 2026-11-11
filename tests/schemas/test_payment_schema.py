"""Unit tests for the Payment schemas."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.payment import (
    PaymentCreate,
    PaymentResponse,
    PaymentUpdate,
    validate_currency,
)


def _create(**overrides):
    data = {
        "description": "Physiotherapy",
        "amount": "45.00",
        "currency": "EUR",
        "payment_type": "private",
        "patient_id": 1,
    }
    data.update(overrides)
    return PaymentCreate(**data)


class TestPaymentCreate:
    def test_defaults(self):
        obj = _create()
        assert obj.amount == Decimal("45.00")
        assert obj.status == "due"
        assert obj.tax_deductible is False
        assert obj.due_reminder_days == [3, 1]

    def test_zero_amount_allowed(self):
        assert _create(amount="0").amount == Decimal("0")

    @pytest.mark.parametrize(
        "overrides",
        [
            {"amount": "-0.01"},
            {"amount": "1.234"},
            {"payment_type": "unknown"},
            {"payment_method": "unknown"},
            {"description": "x"},
            {"due_reminder_days": [0]},
        ],
    )
    def test_rejects_invalid(self, overrides):
        with pytest.raises(ValidationError):
            _create(**overrides)


class TestCurrency:
    @pytest.mark.parametrize("raw,expected", [("eur", "EUR"), (" usd ", "USD"), ("CHF", "CHF")])
    def test_normalizes(self, raw, expected):
        assert validate_currency(raw) == expected

    @pytest.mark.parametrize("bad", ["EU", "EURO", "€€€", "12A", "ÉUR"])
    def test_rejects(self, bad):
        with pytest.raises(ValueError):
            validate_currency(bad)


class TestPaymentUpdate:
    @pytest.mark.parametrize(
        "field", ["description", "amount", "currency", "payment_type", "status", "tax_deductible"]
    )
    def test_rejects_explicit_null(self, field):
        with pytest.raises(ValidationError):
            PaymentUpdate(**{field: None})

    def test_optional_fields_can_be_cleared(self):
        obj = PaymentUpdate(due_date=None, payment_method=None)
        assert obj.model_dump(exclude_unset=True) == {"due_date": None, "payment_method": None}


def test_response_amount_is_json_number():
    resp = PaymentResponse(
        id=1,
        patient_id=1,
        description="Visit",
        amount=Decimal("12.50"),
        currency="EUR",
        payment_type="copay",
        status="paid",
    )
    assert resp.model_dump(mode="json")["amount"] == 12.5
