"""CRUD operations for healthcare Payments."""

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.core.utils.datetime_utils import get_facility_timezone
from app.crud.base import CRUDBase
from app.crud.base_tags import TagFilterMixin
from app.models.scheduling import Payment, PaymentStatus
from app.schemas.payment import PaymentCreate, PaymentUpdate


def _facility_today() -> date:
    return datetime.now(get_facility_timezone()).date()


class CRUDPayment(
    CRUDBase[Payment, PaymentCreate, PaymentUpdate],
    TagFilterMixin,
):
    """Payment CRUD operations."""

    def get_by_patient(
        self,
        db: Session,
        *,
        patient_id: int,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        payment_type: Optional[str] = None,
        appointment_id: Optional[int] = None,
        prescription_id: Optional[int] = None,
        tax_deductible: Optional[bool] = None,
        tags: Optional[List[str]] = None,
        tag_match_all: bool = False,
    ) -> List[Payment]:
        """Payments of a patient, most recent (paid or due) date first."""
        query = db.query(self.model).filter(self.model.patient_id == patient_id)
        if status:
            query = query.filter(self.model.status == status.lower())
        if payment_type:
            query = query.filter(self.model.payment_type == payment_type.lower())
        if appointment_id is not None:
            query = query.filter(self.model.appointment_id == appointment_id)
        if prescription_id is not None:
            query = query.filter(self.model.prescription_id == prescription_id)
        if tax_deductible is not None:
            query = query.filter(self.model.tax_deductible.is_(tax_deductible))
        query = self._apply_tag_filter(query, tags=tags, tag_match_all=tag_match_all)
        sort_date = func.coalesce(self.model.paid_date, self.model.due_date)
        return (
            query.order_by(
                sort_date.desc().nullslast(),
                self.model.created_at.desc(),
                self.model.id.desc(),
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_due_soon(
        self,
        db: Session,
        *,
        patient_id: int,
        days: int = 30,
        today: Optional[date] = None,
    ) -> List[Payment]:
        """Unpaid payments due within ``days`` days, overdue ones included."""
        today = today or _facility_today()
        return (
            db.query(self.model)
            .filter(self.model.patient_id == patient_id)
            .filter(self.model.status == PaymentStatus.DUE.value)
            .filter(self.model.due_date.isnot(None))
            .filter(self.model.due_date <= today + timedelta(days=days))
            .order_by(self.model.due_date.asc(), self.model.id.asc())
            .all()
        )

    def get_summary(
        self, db: Session, *, patient_id: int, year: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Totals per currency. With ``year``, paid amounts count by paid date
        and due amounts by due date within that year."""
        query = db.query(self.model).filter(
            self.model.patient_id == patient_id,
            self.model.status != PaymentStatus.CANCELLED.value,
        )
        if year is not None:
            query = query.filter(
                (
                    (self.model.status == PaymentStatus.PAID.value)
                    & (extract("year", self.model.paid_date) == year)
                )
                | (
                    (self.model.status == PaymentStatus.DUE.value)
                    & (extract("year", self.model.due_date) == year)
                )
            )

        totals: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "total_paid": Decimal("0"),
                "total_due": Decimal("0"),
                "total_tax_deductible_paid": Decimal("0"),
                "count": 0,
            }
        )
        for payment in query.all():
            bucket = totals[payment.currency]
            bucket["count"] += 1
            amount = Decimal(payment.amount)
            if payment.status == PaymentStatus.PAID.value:
                bucket["total_paid"] += amount
                if payment.tax_deductible:
                    bucket["total_tax_deductible_paid"] += amount
            else:
                bucket["total_due"] += amount

        return [
            {
                "currency": currency,
                "total_paid": float(values["total_paid"]),
                "total_due": float(values["total_due"]),
                "total_tax_deductible_paid": float(
                    values["total_tax_deductible_paid"]
                ),
                "count": values["count"],
            }
            for currency, values in sorted(totals.items())
        ]

    @staticmethod
    def _fill_paid_date(data: Dict[str, Any], current_paid: Optional[date]) -> None:
        """Marking a payment paid without a date records today."""
        if (
            data.get("status") == PaymentStatus.PAID.value
            and data.get("paid_date") is None
            and current_paid is None
        ):
            data["paid_date"] = _facility_today()

    def create(self, db: Session, *, obj_in: PaymentCreate) -> Payment:
        data = self._normalize_input(obj_in)
        self._fill_paid_date(data, None)
        return super().create(db, obj_in=data)

    def update(
        self,
        db: Session,
        *,
        db_obj: Payment,
        obj_in: Union[PaymentUpdate, Dict[str, Any]],
    ) -> Payment:
        data = self._normalize_input(obj_in, exclude_unset=True)
        self._fill_paid_date(data, data.get("paid_date", db_obj.paid_date))
        return super().update(db, db_obj=db_obj, obj_in=data)


payment = CRUDPayment(Payment)
