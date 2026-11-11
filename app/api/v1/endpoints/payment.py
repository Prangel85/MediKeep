"""API endpoints for healthcare Payments."""

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
from app.crud.payment import payment
from app.models.activity_log import EntityType
from app.models.models import User
from app.schemas.payment import (
    PaymentCreate,
    PaymentResponse,
    PaymentSummary,
    PaymentUpdate,
)

router = APIRouter()

logger = get_logger(__name__, "app")


@router.post("/", response_model=PaymentResponse)
def create_payment(
    *,
    payment_in: PaymentCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Create a new payment."""
    with handle_database_errors(request=request):
        verify_same_patient_links(
            db,
            request,
            payment_in.patient_id,
            appointment_id=payment_in.appointment_id,
            prescription_id=payment_in.prescription_id,
        )
    return handle_create_with_logging(
        db=db,
        crud_obj=payment,
        obj_in=payment_in,
        entity_type=EntityType.PAYMENT,
        user_id=current_user_id,
        entity_name="Payment",
        request=request,
        current_user_patient_id=current_user_patient_id,
        current_user=current_user,
    )


@router.get("/", response_model=List[PaymentResponse])
def read_payments(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10000, ge=1, le=10000),
    status: Optional[str] = Query(None),
    payment_type: Optional[str] = Query(None),
    appointment_id: Optional[int] = Query(None),
    prescription_id: Optional[int] = Query(None),
    tax_deductible: Optional[bool] = Query(None),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    tag_match_all: bool = Query(
        False, description="Match all tags (AND) vs any tag (OR)"
    ),
    target_patient_id: int = Depends(deps.get_accessible_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
) -> Any:
    """Retrieve payments for the current or an accessible patient."""
    with handle_database_errors(request=request):
        results = payment.get_by_patient(
            db,
            patient_id=target_patient_id,
            skip=skip,
            limit=limit,
            status=status,
            payment_type=payment_type,
            appointment_id=appointment_id,
            prescription_id=prescription_id,
            tax_deductible=tax_deductible,
            tags=tags,
            tag_match_all=tag_match_all,
        )
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "Payment",
            patient_id=target_patient_id,
            count=len(results),
        )
        return results


@router.get("/due", response_model=List[PaymentResponse])
def read_due_payments(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    days: int = Query(default=30, ge=1, le=366),
    target_patient_id: int = Depends(deps.get_accessible_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
) -> Any:
    """Unpaid payments due in the next ``days`` days, overdue ones first."""
    with handle_database_errors(request=request):
        results = payment.get_due_soon(db, patient_id=target_patient_id, days=days)
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "DuePayment",
            patient_id=target_patient_id,
            count=len(results),
        )
        return results


@router.get("/summary", response_model=List[PaymentSummary])
def read_payment_summary(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    year: Optional[int] = Query(None, ge=1900, le=2200),
    target_patient_id: int = Depends(deps.get_accessible_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
) -> Any:
    """Paid, due and tax-deductible totals per currency, optionally for one year."""
    with handle_database_errors(request=request):
        results = payment.get_summary(db, patient_id=target_patient_id, year=year)
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "PaymentSummary",
            patient_id=target_patient_id,
            count=len(results),
        )
        return results


@router.get("/{payment_id}", response_model=PaymentResponse)
def read_payment(
    *,
    request: Request,
    db: Session = Depends(deps.get_db),
    payment_id: int,
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Get a payment by ID."""
    with handle_database_errors(request=request):
        obj = payment.get(db, id=payment_id)
        handle_not_found(obj, "Payment", request)
        verify_patient_ownership(
            obj,
            current_user_patient_id,
            "payment",
            db=db,
            current_user=current_user,
        )
        log_data_access(
            logger,
            request,
            current_user_id,
            "read",
            "Payment",
            record_id=payment_id,
            patient_id=obj.patient_id,
        )
        return obj


@router.put("/{payment_id}", response_model=PaymentResponse)
def update_payment(
    *,
    payment_id: int,
    payment_in: PaymentUpdate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Update a payment."""
    if payment_in.model_fields_set & {"appointment_id", "prescription_id"}:
        with handle_database_errors(request=request):
            existing = payment.get(db, id=payment_id)
            handle_not_found(existing, "Payment", request)
            verify_patient_ownership(
                existing,
                current_user_patient_id,
                "payment",
                db=db,
                current_user=current_user,
                permission="edit",
            )
            verify_same_patient_links(
                db,
                request,
                existing.patient_id,
                appointment_id=payment_in.appointment_id,
                prescription_id=payment_in.prescription_id,
            )
    return handle_update_with_logging(
        db=db,
        crud_obj=payment,
        entity_id=payment_id,
        obj_in=payment_in,
        entity_type=EntityType.PAYMENT,
        user_id=current_user_id,
        entity_name="Payment",
        request=request,
        current_user=current_user,
        current_user_patient_id=current_user_patient_id,
    )


@router.delete("/{payment_id}")
def delete_payment(
    *,
    payment_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user_id: int = Depends(deps.get_current_user_id),
    current_user: User = Depends(deps.get_current_user),
    current_user_patient_id: int = Depends(deps.get_current_user_patient_id),
) -> Any:
    """Delete a payment."""
    return handle_delete_with_logging(
        db=db,
        crud_obj=payment,
        entity_id=payment_id,
        entity_type=EntityType.PAYMENT,
        user_id=current_user_id,
        entity_name="Payment",
        request=request,
        current_user=current_user,
        current_user_patient_id=current_user_patient_id,
    )
