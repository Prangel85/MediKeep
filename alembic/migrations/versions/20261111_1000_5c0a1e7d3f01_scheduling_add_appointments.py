"""Scheduling: add appointments

Revision ID: 5c0a1e7d3f01
Revises: b8e2d5f1c934
Create Date: 2026-11-11 10:00:00.000000

Adds the appointments table (upcoming visits/exams with reminder lead times).
Part of the "scheduling" feature (appointments, prescriptions, payments);
every migration of the feature is prefixed with "scheduling_" so it is easy
to re-chain them after upstream adds its own migrations.
"""

import sqlalchemy as sa
from alembic import op

revision = "5c0a1e7d3f01"
down_revision = "b8e2d5f1c934"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "appointments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "patient_id",
            sa.Integer(),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "practitioner_id",
            sa.Integer(),
            sa.ForeignKey("practitioners.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "practice_id",
            sa.Integer(),
            sa.ForeignKey("practices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "encounter_id",
            sa.Integer(),
            sa.ForeignKey("encounters.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("appointment_type", sa.String(length=50), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("location", sa.String(length=300), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="scheduled",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "reminder_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("reminder_offsets_minutes", sa.JSON(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "idx_appointments_patient_scheduled",
        "appointments",
        ["patient_id", "scheduled_at"],
    )
    op.create_index(
        "idx_appointments_status_scheduled",
        "appointments",
        ["status", "scheduled_at"],
    )
    op.create_index(
        "idx_appointments_encounter_id",
        "appointments",
        ["encounter_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_appointments_encounter_id", table_name="appointments")
    op.drop_index("idx_appointments_status_scheduled", table_name="appointments")
    op.drop_index("idx_appointments_patient_scheduled", table_name="appointments")
    op.drop_table("appointments")
