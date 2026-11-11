"""API endpoints for scheduled Appointments."""

from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.api.activity_logging import log_create, log_update
from app.api.v1.endpoints.utils import (
    handle_create_with_logging,
    handle_delete_with_logging,
    handle_not_found,
    handle_update_with_logging,
    verify_patient_ownership,
)
from app.core.http.error_handling import (
    BusinessLogicException,
    ConflictException,
    handle_database_errors,
)
from app.core.logging.config import get_logger
from app.core.logging.helpers import log_data_access
from app.core.utils.datetime_utils import get_facility_timezone, to_local
from app.crud.appointment import appointment
from app.crud.encounter import encounter
from app.models.activity_log import EntityType
from app.models.models import User
from app.models.scheduling import AppointmentStatus
from app.schemas.appointment import (
    AppointmentComplete,
    AppointmentCreate,
    AppointmentResponse,
    AppointmentUpdate,
)
from app.schemas.encounter import EncounterCreate

router = APIRouter()

logger = get_logger(__name__, "app")


@router.post("/", response_model=AppointmentResponse)
def create_appointment(
    *,
    appointment_in: AppointmentCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Create a new appointment."""
    return handle_create_with_logging(
        db=db,
        crud_obj=appointment,
        obj_in=appointment_in,
        entity_type=EntityType.APPOINTMENT,
        user_id=current_user_id,
        entity_name="Appointment",
        request=request,
        current_user_patient_id=current_user_patient_id,
        current_user=current_user,
    )


@router.get("/", response_model=List[AppointmentResponse])
def read_appointments(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10000, ge=1, le=10000),
    status: Optional[str] = Query(None),
    start: Optional[datetime] = Query(None, description="Scheduled at or after"),
    end: Optional[datetime] = Query(None, description="Scheduled at or before"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    tag_match_all: bool = Query(
        False, description="Match all tags (AND) vs any tag (OR)"
    ),
    target_patient_id: int = Depends(deps.get_accessible_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
) -> Any:
    """Retrieve appointments for the current or an accessible patient."""
    with handle_database_errors(request=request):
        results = appointment.get_by_patient(
            db,
            patient_id=target_patient_id,
            skip=skip,
            limit=limit,
            status=status,
            start=start,
            end=end,
            tags=tags,
            tag_match_all=tag_match_all,
        )
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "Appointment",
            patient_id=target_patient_id,
            count=len(results),
        )
        return results


@router.get("/upcoming", response_model=List[AppointmentResponse])
def read_upcoming_appointments(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    days: int = Query(default=30, ge=1, le=366),
    limit: int = Query(default=20, ge=1, le=100),
    target_patient_id: int = Depends(deps.get_accessible_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
) -> Any:
    """Scheduled or confirmed appointments in the next ``days`` days, soonest first."""
    with handle_database_errors(request=request):
        results = appointment.get_upcoming(
            db, patient_id=target_patient_id, days=days, limit=limit
        )
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "UpcomingAppointment",
            patient_id=target_patient_id,
            count=len(results),
        )
        return results


@router.get("/{appointment_id}", response_model=AppointmentResponse)
def read_appointment(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    appointment_id: int,
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get an appointment by ID."""
    with handle_database_errors(request=request):
        obj = appointment.get(db, id=appointment_id)
        handle_not_found(obj, "Appointment", request)
        verify_patient_ownership(
            obj,
            current_user_patient_id,
            "appointment",
            db=db,
            current_user=current_user,
        )
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "Appointment",
            record_id=appointment_id,
            patient_id=obj.patient_id,
        )
        return obj


@router.put("/{appointment_id}", response_model=AppointmentResponse)
def update_appointment(
    *,
    appointment_id: int,
    appointment_in: AppointmentUpdate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Update an appointment."""
    return handle_update_with_logging(
        db=db,
        crud_obj=appointment,
        entity_id=appointment_id,
        obj_in=appointment_in,
        entity_type=EntityType.APPOINTMENT,
        user_id=current_user_id,
        entity_name="Appointment",
        request=request,
        current_user=current_user,
        current_user_patient_id=current_user_patient_id,
    )


@router.post("/{appointment_id}/complete", response_model=AppointmentResponse)
def complete_appointment(
    *,
    appointment_id: int,
    complete_in: AppointmentComplete,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Mark an appointment as completed and link it to a visit (Encounter).

    Links the given ``encounter_id`` (which must belong to the same patient)
    or, when none is given, creates a new visit from the appointment data.
    """
    with handle_database_errors(request=request):
        obj = appointment.get(db, id=appointment_id)
        handle_not_found(obj, "Appointment", request)
        verify_patient_ownership(
            obj,
            current_user_patient_id,
            "appointment",
            db=db,
            current_user=current_user,
            permission="edit",
        )

        if obj.status == AppointmentStatus.CANCELLED.value:
            raise BusinessLogicException(
                message="A cancelled appointment cannot be completed",
                request=request,
            )
        if obj.encounter_id is not None:
            raise ConflictException(
                message="Appointment is already linked to a visit",
                request=request,
            )

        if complete_in.encounter_id is not None:
            visit = encounter.get(db, id=complete_in.encounter_id)
            # Same 404 for "missing" and "other patient": don't leak existence.
            if visit is None or visit.patient_id != obj.patient_id:
                handle_not_found(None, "Encounter", request)
        else:
            # Encounters cannot be future-dated: an appointment completed
            # ahead of schedule is recorded as a visit held today.
            local_dt = to_local(obj.scheduled_at) or obj.scheduled_at
            visit_date = min(
                local_dt.date(), datetime.now(get_facility_timezone()).date()
            )
            visit = encounter.create(
                db,
                obj_in=EncounterCreate(
                    patient_id=obj.patient_id,
                    practitioner_id=obj.practitioner_id,
                    reason=obj.title,
                    date=visit_date,
                    location=obj.location,
                    duration_minutes=obj.duration_minutes,
                    notes=complete_in.notes,
                ),
            )
            log_create(
                db=db,
                entity_type=EntityType.ENCOUNTER,
                entity_obj=visit,
                user_id=current_user_id,
                request=request,
            )

        updated = appointment.update(
            db,
            db_obj=obj,
            obj_in={
                "status": AppointmentStatus.COMPLETED.value,
                "encounter_id": visit.id,
            },
        )
        log_update(
            db=db,
            entity_type=EntityType.APPOINTMENT,
            entity_obj=updated,
            user_id=current_user_id,
            request=request,
        )
        logger.info(
            "Appointment completed",
            extra={
                "event": "appointment_completed",
                "appointment_id": updated.id,
                "encounter_id": visit.id,
                "patient_id": updated.patient_id,
                "user_id": current_user_id,
            },
        )
        return updated


@router.delete("/{appointment_id}")
def delete_appointment(
    *,
    appointment_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Delete an appointment. A linked visit is kept."""
    return handle_delete_with_logging(
        db=db,
        crud_obj=appointment,
        entity_id=appointment_id,
        entity_type=EntityType.APPOINTMENT,
        user_id=current_user_id,
        entity_name="Appointment",
        request=request,
        current_user=current_user,
        current_user_patient_id=current_user_patient_id,
    )
