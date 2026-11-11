"""Helpers shared by the scheduling schemas (appointments, prescriptions, payments)."""

from datetime import datetime, timezone
from typing import List, Optional


def serialize_datetime_utc(value: Optional[datetime]) -> Optional[str]:
    """Emit stored (naive UTC) datetimes as explicit UTC ISO strings."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


def validate_choice(v: Optional[str], allowed: list, label: str) -> Optional[str]:
    """Normalise (strip, lower-case) and check ``v`` against ``allowed``."""
    if v is None:
        return None
    normalized = v.strip().lower()
    if normalized not in allowed:
        raise ValueError(f"{label} must be one of: {', '.join(allowed)}")
    return normalized


def validate_int_list(
    v: Optional[List[int]],
    *,
    minimum: int,
    maximum: int,
    max_items: int,
    label: str,
) -> Optional[List[int]]:
    """Validate a list of bounded whole numbers; returns it de-duplicated,
    sorted from largest to smallest."""
    if v is None:
        return None
    if len(v) > max_items:
        raise ValueError(f"At most {max_items} {label} are allowed")
    for item in v:
        if isinstance(item, bool) or not isinstance(item, int):
            raise ValueError(f"{label.capitalize()} must be whole numbers")
        if item < minimum or item > maximum:
            raise ValueError(
                f"{label.capitalize()} must be between {minimum} and {maximum}"
            )
    return sorted(set(v), reverse=True)
