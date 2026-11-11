"""CRUD operations for Prescriptions / referrals."""

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Union

from sqlalchemy.orm import Session

from app.core.http.error_handling import ValidationException
from app.core.utils.datetime_utils import get_facility_timezone
from app.crud.base import CRUDBase
from app.crud.base_tags import TagFilterMixin
from app.models.scheduling import Prescription, PrescriptionStatus
from app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionUpdate,
    validate_prescription_dates,
)


def _facility_today() -> date:
    return datetime.now(get_facility_timezone()).date()


class CRUDPrescription(
    CRUDBase[Prescription, PrescriptionCreate, PrescriptionUpdate],
    TagFilterMixin,
):
    """Prescription CRUD operations, newest issue date first."""

    def get_by_patient(
        self,
        db: Session,
        *,
        patient_id: int,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        prescription_type: Optional[str] = None,
        appointment_id: Optional[int] = None,
        tags: Optional[List[str]] = None,
        tag_match_all: bool = False,
    ) -> List[Prescription]:
        query = db.query(self.model).filter(self.model.patient_id == patient_id)
        if status:
            query = query.filter(self.model.status == status.lower())
        if prescription_type:
            query = query.filter(
                self.model.prescription_type == prescription_type.lower()
            )
        if appointment_id is not None:
            query = query.filter(self.model.appointment_id == appointment_id)
        query = self._apply_tag_filter(query, tags=tags, tag_match_all=tag_match_all)
        return (
            query.order_by(self.model.issued_date.desc(), self.model.id.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_expiring(
        self,
        db: Session,
        *,
        patient_id: int,
        days: int = 30,
        today: Optional[date] = None,
    ) -> List[Prescription]:
        """Unused (active) prescriptions expiring between today and ``days`` ahead."""
        today = today or _facility_today()
        return (
            db.query(self.model)
            .filter(self.model.patient_id == patient_id)
            .filter(self.model.status == PrescriptionStatus.ACTIVE.value)
            .filter(self.model.expiry_date.isnot(None))
            .filter(self.model.expiry_date >= today)
            .filter(self.model.expiry_date <= today + timedelta(days=days))
            .order_by(self.model.expiry_date.asc(), self.model.id.asc())
            .all()
        )

    @staticmethod
    def _fill_used_date(data: Dict[str, Any], current_used: Optional[date]) -> None:
        """Marking a prescription used without a date records today."""
        if (
            data.get("status") == PrescriptionStatus.USED.value
            and data.get("used_date") is None
            and current_used is None
        ):
            data["used_date"] = _facility_today()

    def create(self, db: Session, *, obj_in: PrescriptionCreate) -> Prescription:
        data = self._normalize_input(obj_in)
        self._fill_used_date(data, None)
        return super().create(db, obj_in=data)

    def update(
        self,
        db: Session,
        *,
        db_obj: Prescription,
        obj_in: Union[PrescriptionUpdate, Dict[str, Any]],
    ) -> Prescription:
        """Update, re-validating the dates against the stored values."""
        data = self._normalize_input(obj_in, exclude_unset=True)
        try:
            validate_prescription_dates(
                data.get("issued_date", db_obj.issued_date),
                data.get("expiry_date", db_obj.expiry_date),
                data.get("used_date", db_obj.used_date),
            )
        except ValueError as exc:
            raise ValidationException(
                message="Validation failed for field 'dates'",
                description=str(exc),
                validation_errors=[f"dates: {exc}"],
            ) from exc
        self._fill_used_date(data, data.get("used_date", db_obj.used_date))
        return super().update(db, db_obj=db_obj, obj_in=data)


prescription = CRUDPrescription(Prescription)
