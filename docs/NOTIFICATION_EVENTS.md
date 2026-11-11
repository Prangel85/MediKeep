# Notification Event System

This guide explains how to work with MediKeep's event-driven notification system.

## Overview

The notification system uses a **publish-subscribe** pattern:

```
Business Logic  -->  Event Bus  -->  Notification Handler  -->  User Channels
     |                   |                    |
  emit event      routes to handlers     sends to Discord/Email/etc
```

**Key benefits:**
- Business code doesn't know about notifications (decoupled)
- Adding new triggers is simple (3 steps)
- Notification failures don't break business operations

---

## Quick Start: Adding a New Notification Trigger

### Step 1: Create the Event Class

Create or add to a file in `app/events/`:

```python
# app/events/medical_events.py
from dataclasses import dataclass
from typing import Optional
from app.core.events.base import DomainEvent


@dataclass(frozen=True)
class AppointmentReminderEvent(DomainEvent):
    """Emitted when an appointment reminder should be sent."""
    patient_name: str
    appointment_time: str
    doctor_name: Optional[str] = None
```

**Rules:**
- Inherit from `DomainEvent`
- Use `@dataclass(frozen=True)` decorator for immutability
- Add fields for data needed in the notification message
- The class name determines the event type: `AppointmentReminderEvent` → `appointment_reminder`

### Step 2: Create the Template

Add a template function in `app/services/notification_templates.py`:

```python
def appointment_reminder_template(data: Dict) -> Tuple[str, str]:
    """Template for appointment reminder notification."""
    patient = data.get("patient_name", "Patient")
    time = data.get("appointment_time", "")
    doctor = data.get("doctor_name", "your doctor")

    return (
        "Appointment Reminder",  # Title
        f"Reminder: {patient} has an appointment with {doctor} at {time}."  # Message
    )
```

**Rules:**
- Function takes `data: Dict` parameter
- Returns `Tuple[str, str]` (title, message)
- Use `.get()` with defaults for safety

### Step 3: Register the Event

Add registration in `app/core/events/__init__.py`:

```python
from app.services.notification_templates import appointment_reminder_template

def register_all_events():
    registry = get_event_registry()

    # ... existing registrations ...

    # Medical events
    registry.register(
        event_type="appointment_reminder",
        label="Appointment Reminder",
        description="Reminder for upcoming appointments",
        category="medical",
        template_fn=appointment_reminder_template,
        is_implemented=True,
    )
```

**That's it!** The notification handler automatically subscribes to all registered events.

### Step 4: Emit the Event

In your business logic:

```python
from app.core.events import get_event_bus
from app.events.medical_events import AppointmentReminderEvent

async def schedule_appointment(user_id: int, patient_name: str, time: str):
    # ... business logic ...

    # Emit event (notification handler will pick it up)
    event = AppointmentReminderEvent(
        user_id=user_id,  # Required: who receives the notification
        patient_name=patient_name,
        appointment_time=time,
    )
    await get_event_bus().publish(event)
```

From a plain `def` endpoint, which FastAPI runs in a worker thread, call
`publish_from_thread(event)` from `app.core.events` instead. It hands the event to the
app's event loop and returns without waiting for the handlers, so a slow notification
channel does not slow the response.

---

## Architecture

### File Structure

```
app/
├── core/
│   └── events/
│       ├── __init__.py      # Exports + register_all_events()
│       ├── base.py          # DomainEvent base class
│       ├── bus.py           # EventBus (publish/subscribe)
│       └── registry.py      # EventRegistry (metadata + templates)
│
├── events/                   # Domain event definitions
│   ├── __init__.py          # Exports all events
│   ├── backup_events.py     # BackupCompletedEvent, BackupFailedEvent
│   ├── collaboration_events.py  # Invitation/sharing events
│   ├── medication_events.py # MedicationReminderDueEvent
│   ├── scheduling_events.py # Appointment / prescription / payment reminders
│   └── security_events.py   # PasswordChangedEvent
│
└── services/
    ├── notification_handlers.py   # Subscribes to events
    ├── notification_templates.py  # Message templates
    ├── scheduling_notification_templates.py  # Templates for scheduling events
    └── scheduling_reminder_scheduler.py      # Publishes scheduling reminders
```

### Components

#### DomainEvent (base class)
Every event inherits these fields:
- `event_id` - Unique UUID (auto-generated)
- `occurred_at` - Timestamp (auto-generated)
- `user_id` - Who should receive the notification (required for notifications)

```python
@dataclass
class DomainEvent:
    event_id: str          # Auto-generated UUID
    occurred_at: datetime  # Auto-generated timestamp
    user_id: Optional[int] = None  # Set this for notifications
```

#### EventBus
Manages event routing:
```python
bus = get_event_bus()
bus.subscribe("event_type", handler_function)
await bus.publish(event)
```

#### EventRegistry
Single source of truth for event metadata:
```python
registry = get_event_registry()
registry.register(event_type="...", label="...", ...)
metadata = registry.get("event_type")
title, message = registry.get_template("event_type", data)
```

---

## Current Event Types

| Event Type | Category | Description |
|------------|----------|-------------|
| `backup_completed` | system | Backup finished successfully |
| `backup_failed` | system | Backup failed |
| `invitation_received` | collaboration | User received a sharing invitation |
| `invitation_accepted` | collaboration | Someone accepted your invitation |
| `share_revoked` | collaboration | Access to shared records revoked |
| `password_changed` | security | Password was changed |
| `two_factor_disabled` | security | Two-factor was turned off, by the user or by an admin (`by_admin`) |
| `backup_code_used` | security | A backup code was used to sign in (`codes_remaining`) |
| `sessions_revoked` | security | The user signed out their other devices |
| `two_factor_failures` | security | The correct password was followed by enough wrong codes to lock the code step |
| `medication_reminder_due` | medical | A scheduled medication reminder time has arrived (fired by the per-minute `MedicationReminderSchedulerService`; idempotent via `NotificationHistory` dedup) |
| `appointment_upcoming` | medical | A reminder lead time of a scheduled or confirmed appointment was reached (`offset_minutes`, `scheduled_at_local`) |
| `prescription_expiring` | medical | An unused (active) prescription is `days_before` days from its `expiry_date` |
| `payment_due` | medical | An unpaid payment is `days_before` days from its `due_date` (`amount`, `currency`) |

### Scheduling reminders

`appointment_upcoming`, `prescription_expiring` and `payment_due` are published
by `SchedulingReminderSchedulerService`
(`app/services/scheduling_reminder_scheduler.py`), started and stopped with
the app next to the medication reminder scheduler. It runs in the facility
timezone (`TZ`) and sends each notification to the **patient owner**.

| Event | Checked | Sent when | Idempotency key (in `NotificationHistory.event_data`) |
|-------|---------|-----------|------------------------------------------------------|
| `appointment_upcoming` | every minute | `scheduled_at - offset` has passed by less than 30 minutes and the appointment has not started; one reminder per lead time in `reminder_offsets_minutes` (default 7 days, 1 day, 2 hours) | `appointment_id`, `offset_minutes`, `scheduled_at_utc` |
| `prescription_expiring` | hourly, from 08:00 | today is one of `expiry_reminder_days` (default 7 and 1) before `expiry_date`, status `active` | `prescription_id`, `days_before`, `expiry_date` |
| `payment_due` | hourly, from 08:00 | today is one of `due_reminder_days` (default 3 and 1) before `due_date`, status `due` | `payment_id`, `days_before`, `due_date` |

Notes:

- Reminders can be turned off per record (`reminder_enabled`).
- The 30-minute grace window lets a reminder survive a restart, while lead
  times that had already passed when the appointment was created are skipped
  (no "7 days before" message for an appointment booked 2 days ahead).
- Rescheduling an appointment changes `scheduled_at_utc`, so its reminders
  are sent again for the new time.
- The daily checks run hourly instead of once, so downtime at 08:00 does not
  skip a day.
- Besides `NotificationHistory`, the scheduler remembers what it published in
  memory, so owners without an enabled channel (no history row is written
  for them) are not processed again every tick.
- Logs contain only IDs, lead times and dates, never titles, descriptions or
  amounts.

---

## Event Categories

Events are grouped by category for the UI:

- **system** - Backups, maintenance, system health
- **collaboration** - Sharing, invitations, access changes
- **security** - Password changes, login alerts
- **medical** - Appointments, lab results, reminders

---

## Testing Events

### Unit Test for Event Class
```python
def test_appointment_reminder_event():
    event = AppointmentReminderEvent(
        user_id=1,
        patient_name="John Doe",
        appointment_time="2026-01-30 10:00"
    )

    assert event.event_type() == "appointment_reminder"
    assert event.user_id == 1

    data = event.to_notification_data()
    assert data["patient_name"] == "John Doe"
```

### Unit Test for Template
```python
def test_appointment_reminder_template():
    data = {
        "patient_name": "John Doe",
        "appointment_time": "2026-01-30 10:00",
        "doctor_name": "Dr. Smith"
    }

    title, message = appointment_reminder_template(data)

    assert title == "Appointment Reminder"
    assert "John Doe" in message
    assert "Dr. Smith" in message
```

### Integration Test
```python
import asyncio

async def test_event_flow():
    from app.core.events import setup_event_system, get_event_bus
    from app.events.medical_events import AppointmentReminderEvent

    setup_event_system()
    bus = get_event_bus()

    received = []
    async def test_handler(event):
        received.append(event)

    bus.subscribe("appointment_reminder", test_handler)

    event = AppointmentReminderEvent(user_id=1, patient_name="Test", appointment_time="Now")
    await bus.publish(event)

    assert len(received) == 1
    assert received[0].patient_name == "Test"
```

---

## Troubleshooting

### Event not triggering notifications

1. **Check `user_id` is set** - Events without `user_id` are skipped
2. **Check event is registered** - Run: `registry.get("your_event_type")`
3. **Check `is_implemented=True`** - In registration
4. **Check user has channels configured** - User needs at least one notification channel

### Template not working

1. **Check function signature** - Must be `(data: Dict) -> Tuple[str, str]`
2. **Check data keys** - Use `.get()` with defaults
3. **Test template directly** - `template_fn({"key": "value"})`

### Handler errors

Handler errors are logged but don't break business logic. Check logs for:
```
event_handler_error - notification_handlers.py
```

---

## Best Practices

1. **Keep events immutable** - Use `@dataclass` with only data fields
2. **Use descriptive names** - `PatientRecordUpdatedEvent` not `UpdateEvent`
3. **Include context** - Add fields needed for a meaningful notification
4. **Test templates** - Ensure they handle missing data gracefully
5. **Don't await notifications** - Fire and forget (errors are isolated)

