"""Shared checks for links between scheduling records (appointments,
prescriptions, payments) and other records of the same patient."""

from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.api.v1.endpoints.utils import handle_not_found


def verify_same_patient_links(
    db: Session,
    request: Request,
    patient_id: int,
    *,
    appointment_id: Optional[int] = None,
    medication_id: Optional[int] = None,
    prescription_id: Optional[int] = None,
) -> None:
    """Each linked record must exist and belong to ``patient_id``.

    A record of another patient is reported as not found, like a missing one,
    so the response does not reveal that it exists.
    """
    from app.crud.appointment import appointment
    from app.crud.medication import medication
    from app.crud.prescription import prescription

    for record_id, crud_obj, name in (
        (appointment_id, appointment, "Appointment"),
        (medication_id, medication, "Medication"),
        (prescription_id, prescription, "Prescription"),
    ):
        if record_id is None:
            continue
        linked = crud_obj.get(db, id=record_id)
        if linked is None or linked.patient_id != patient_id:
            handle_not_found(None, name, request)
