"""Notification templates for the scheduling events (appointments,
prescriptions, payments). Same conventions as notification_templates.py:
each template takes the event data dict and returns (title, message)."""

from typing import Dict, Tuple


def format_lead_time(minutes: int) -> str:
    """Human-readable lead time: 10080 -> "7 days", 120 -> "2 hours"."""
    if minutes <= 0:
        return "now"
    for unit_minutes, singular, plural in (
        (24 * 60, "day", "days"),
        (60, "hour", "hours"),
        (1, "minute", "minutes"),
    ):
        if minutes % unit_minutes == 0:
            count = minutes // unit_minutes
            return f"{count} {singular if count == 1 else plural}"
    return f"{minutes} minutes"


def _days_phrase(days: int) -> str:
    if days == 0:
        return "today"
    if days == 1:
        return "tomorrow"
    return f"in {days} days"


def appointment_upcoming_template(data: Dict) -> Tuple[str, str]:
    """
    Template for upcoming appointment reminders.

    Args:
        data: Event data containing title, scheduled_at_local, offset_minutes,
            and optionally location and practitioner_name.
    """
    title = data.get("title") or "Appointment"
    when = data.get("scheduled_at_local", "")
    lead = format_lead_time(int(data.get("offset_minutes") or 0))

    lines = [f"{title} is scheduled for {when} (in {lead})."]
    if data.get("practitioner_name"):
        lines.append(f"With: {data['practitioner_name']}")
    if data.get("location"):
        lines.append(f"Where: {data['location']}")
    return (f"Upcoming appointment: {title}", "\n".join(lines))


def prescription_expiring_template(data: Dict) -> Tuple[str, str]:
    """
    Template for prescriptions about to expire while unused.

    Args:
        data: Event data containing title, expiry_date, days_before and
            optionally prescription_number.
    """
    title = data.get("title") or "Prescription"
    days = int(data.get("days_before") or 0)
    expiry = data.get("expiry_date", "")
    body = f"{title} expires {_days_phrase(days)} ({expiry}) and has not been used yet."
    if data.get("prescription_number"):
        body += f"\nNumber: {data['prescription_number']}"
    return (f"Prescription expiring: {title}", body)


def payment_due_template(data: Dict) -> Tuple[str, str]:
    """
    Template for unpaid payments coming due.

    Args:
        data: Event data containing description, amount, currency, due_date
            and days_before.
    """
    description = data.get("description") or "Payment"
    days = int(data.get("days_before") or 0)
    amount = f"{data.get('amount', '')} {data.get('currency', '')}".strip()
    due = data.get("due_date", "")
    body = f"{description}: {amount} is due {_days_phrase(days)} ({due})."
    return (f"Payment due: {description}", body)
