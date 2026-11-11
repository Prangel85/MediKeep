"""API endpoints for Prescriptions / referrals."""

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.api.v1.endpoints.scheduling_links import verify_same_patient_links
from app.api.v1.endpoints.utils import (
    handle_create_with_logging,
    handle_delete_with_logging,
    handle_not_found,
    handle_update_with_logging,
    verify_patient_ownership,
)
from app.core.http.error_handling import handle_database_errors
from app.core.logging.config import get_logger
from app.core.logging.helpers import log_data_access
from app.crud.prescription import prescription
from app.models.activity_log import EntityType
from app.models.models import User
from app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionResponse,
    PrescriptionUpdate,
)

router = APIRouter()

logger = get_logger(__name__, "app")


@router.post("/", response_model=PrescriptionResponse)
def create_prescription(
    *,
    prescription_in: PrescriptionCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Create a new prescription."""
    with handle_database_errors(request=request):
        verify_same_patient_links(
            db,
            request,
            prescription_in.patient_id,
            appointment_id=prescription_in.appointment_id,
            medication_id=prescription_in.medication_id,
        )
    return handle_create_with_logging(
        db=db,
        crud_obj=prescription,
        obj_in=prescription_in,
        entity_type=EntityType.PRESCRIPTION,
        user_id=current_user_id,
        entity_name="Prescription",
        request=request,
        current_user_patient_id=current_user_patient_id,
        current_user=current_user,
    )


@router.get("/", response_model=List[PrescriptionResponse])
def read_prescriptions(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10000, ge=1, le=10000),
    status: Optional[str] = Query(None),
    prescription_type: Optional[str] = Query(None),
    appointment_id: Optional[int] = Query(None),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    tag_match_all: bool = Query(
        False, description="Match all tags (AND) vs any tag (OR)"
    ),
    target_patient_id: int = Depends(deps.get_accessible_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
) -> Any:
    """Retrieve prescriptions for the current or an accessible patient."""
    with handle_database_errors(request=request):
        results = prescription.get_by_patient(
            db,
            patient_id=target_patient_id,
            skip=skip,
            limit=limit,
            status=status,
            prescription_type=prescription_type,
            appointment_id=appointment_id,
            tags=tags,
            tag_match_all=tag_match_all,
        )
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "Prescription",
            patient_id=target_patient_id,
            count=len(results),
        )
        return results


@router.get("/expiring", response_model=List[PrescriptionResponse])
def read_expiring_prescriptions(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    days: int = Query(default=30, ge=1, le=366),
    target_patient_id: int = Depends(deps.get_accessible_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
) -> Any:
    """Unused prescriptions expiring in the next ``days`` days, soonest first."""
    with handle_database_errors(request=request):
        results = prescription.get_expiring(db, patient_id=target_patient_id, days=days)
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "ExpiringPrescription",
            patient_id=target_patient_id,
            count=len(results),
        )
        return results


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
def read_prescription(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    prescription_id: int,
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get a prescription by ID."""
    with handle_database_errors(request=request):
        obj = prescription.get(db, id=prescription_id)
        handle_not_found(obj, "Prescription", request)
        verify_patient_ownership(
            obj,
            current_user_patient_id,
            "prescription",
            db=db,
            current_user=current_user,
        )
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "Prescription",
            record_id=prescription_id,
            patient_id=obj.patient_id,
        )
        return obj


@router.put("/{prescription_id}", response_model=PrescriptionResponse)
def update_prescription(
    *,
    prescription_id: int,
    prescription_in: PrescriptionUpdate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Update a prescription."""
    fields_set = prescription_in.model_fields_set
    if fields_set & {"appointment_id", "medication_id"}:
        with handle_database_errors(request=request):
            existing = prescription.get(db, id=prescription_id)
            handle_not_found(existing, "Prescription", request)
            verify_patient_ownership(
                existing,
                current_user_patient_id,
                "prescription",
                db=db,
                current_user=current_user,
                permission="edit",
            )
            verify_same_patient_links(
                db,
                request,
                existing.patient_id,
                appointment_id=prescription_in.appointment_id,
                medication_id=prescription_in.medication_id,
            )
    return handle_update_with_logging(
        db=db,
        crud_obj=prescription,
        entity_id=prescription_id,
        obj_in=prescription_in,
        entity_type=EntityType.PRESCRIPTION,
        user_id=current_user_id,
        entity_name="Prescription",
        request=request,
        current_user=current_user,
        current_user_patient_id=current_user_patient_id,
    )


@router.delete("/{prescription_id}")
def delete_prescription(
    *,
    prescription_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Delete a prescription."""
    return handle_delete_with_logging(
        db=db,
        crud_obj=prescription,
        entity_id=prescription_id,
        entity_type=EntityType.PRESCRIPTION,
        user_id=current_user_id,
        entity_name="Prescription",
        request=request,
        current_user=current_user,
        current_user_patient_id=current_user_patient_id,
    )
