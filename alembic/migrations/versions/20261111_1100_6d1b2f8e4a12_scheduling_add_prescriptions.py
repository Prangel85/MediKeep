"""Scheduling: add prescriptions

Revision ID: 6d1b2f8e4a12
Revises: 5c0a1e7d3f01
Create Date: 2026-11-11 11:00:00.000000

Adds the prescriptions table (prescriptions/referrals with expiry warnings).
Part of the "scheduling" feature; see the appointments migration.
"""

import sqlalchemy as sa
from alembic import op

revision = "6d1b2f8e4a12"
down_revision = "5c0a1e7d3f01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prescriptions",
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
            "appointment_id",
            sa.Integer(),
            sa.ForeignKey("appointments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "medication_id",
            sa.Integer(),
            sa.ForeignKey("medications.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("prescription_number", sa.String(length=100), nullable=True),
        sa.Column("prescription_type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("issued_date", sa.Date(), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("priority", sa.String(length=30), nullable=True),
        sa.Column("exemption_code", sa.String(length=50), nullable=True),
        sa.Column("items", sa.JSON(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="active",
        ),
        sa.Column("used_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "reminder_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("expiry_reminder_days", sa.JSON(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "idx_prescriptions_patient_issued",
        "prescriptions",
        ["patient_id", "issued_date"],
    )
    op.create_index(
        "idx_prescriptions_status_expiry",
        "prescriptions",
        ["status", "expiry_date"],
    )
    op.create_index(
        "idx_prescriptions_appointment_id",
        "prescriptions",
        ["appointment_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_prescriptions_appointment_id", table_name="prescriptions")
    op.drop_index("idx_prescriptions_status_expiry", table_name="prescriptions")
    op.drop_index("idx_prescriptions_patient_issued", table_name="prescriptions")
    op.drop_table("prescriptions")
