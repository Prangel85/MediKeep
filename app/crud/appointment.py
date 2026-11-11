"""CRUD operations for scheduled Appointments."""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.crud.base_tags import TagFilterMixin
from app.models.scheduling import ACTIVE_APPOINTMENT_STATUSES, Appointment
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate


def _naive_utc(value: datetime) -> datetime:
    """Normalise to naive UTC, the form ``scheduled_at`` is stored in."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class CRUDAppointment(
    CRUDBase[Appointment, AppointmentCreate, AppointmentUpdate],
    TagFilterMixin,
):
    """Appointment CRUD operations, ordered by scheduled time (soonest first)."""

    def __init__(self):
        # Naive input datetimes are facility local time; store them as UTC.
        super().__init__(Appointment, timezone_fields=["scheduled_at"])

    def _convert_timezone_fields(self, obj_data):
        # Store naive UTC: an aware value written to a "timestamp without
        # time zone" column would be shifted by the DB session time zone.
        converted = super()._convert_timezone_fields(obj_data)
        if converted.get("scheduled_at") is not None:
            converted["scheduled_at"] = _naive_utc(converted["scheduled_at"])
        return converted

    def get_by_patient(
        self,
        db: Session,
        *,
        patient_id: int,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        tags: Optional[List[str]] = None,
        tag_match_all: bool = False,
    ) -> List[Appointment]:
        """Appointments of a patient, optionally filtered by status and time range."""
        query = db.query(self.model).filter(self.model.patient_id == patient_id)
        if status:
            query = query.filter(self.model.status == status.lower())
        if start is not None:
            query = query.filter(self.model.scheduled_at >= _naive_utc(start))
        if end is not None:
            query = query.filter(self.model.scheduled_at <= _naive_utc(end))
        query = self._apply_tag_filter(query, tags=tags, tag_match_all=tag_match_all)
        return (
            query.order_by(self.model.scheduled_at.asc(), self.model.id.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_upcoming(
        self,
        db: Session,
        *,
        patient_id: int,
        days: int = 30,
        limit: int = 20,
        now: Optional[datetime] = None,
    ) -> List[Appointment]:
        """Scheduled/confirmed appointments from now to ``days`` ahead."""
        now_utc = _naive_utc(now or datetime.now(timezone.utc))
        return (
            db.query(self.model)
            .filter(self.model.patient_id == patient_id)
            .filter(self.model.status.in_(ACTIVE_APPOINTMENT_STATUSES))
            .filter(self.model.scheduled_at >= now_utc)
            .filter(self.model.scheduled_at <= now_utc + timedelta(days=days))
            .order_by(self.model.scheduled_at.asc(), self.model.id.asc())
            .limit(limit)
            .all()
        )


appointment = CRUDAppointment()
