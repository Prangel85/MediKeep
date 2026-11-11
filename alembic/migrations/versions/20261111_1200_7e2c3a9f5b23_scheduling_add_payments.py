"""Scheduling: add payments

Revision ID: 7e2c3a9f5b23
Revises: 6d1b2f8e4a12
Create Date: 2026-11-11 12:00:00.000000

Adds the payments table (healthcare expenses with due-date warnings).
Part of the "scheduling" feature; see the appointments migration.
"""

import sqlalchemy as sa
from alembic import op

revision = "7e2c3a9f5b23"
down_revision = "6d1b2f8e4a12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "patient_id",
            sa.Integer(),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "appointment_id",
            sa.Integer(),
            sa.ForeignKey("appointments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "prescription_id",
            sa.Integer(),
            sa.ForeignKey("prescriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "practice_id",
            sa.Integer(),
            sa.ForeignKey("practices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("payee", sa.String(length=200), nullable=True),
        sa.Column("description", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("payment_type", sa.String(length=30), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="due",
        ),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.Column("payment_method", sa.String(length=30), nullable=True),
        sa.Column("reference_number", sa.String(length=100), nullable=True),
        sa.Column(
            "tax_deductible",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "reminder_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("due_reminder_days", sa.JSON(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "idx_payments_patient_status", "payments", ["patient_id", "status"]
    )
    op.create_index("idx_payments_status_due", "payments", ["status", "due_date"])
    op.create_index("idx_payments_appointment_id", "payments", ["appointment_id"])
    op.create_index("idx_payments_prescription_id", "payments", ["prescription_id"])


def downgrade() -> None:
    op.drop_index("idx_payments_prescription_id", table_name="payments")
    op.drop_index("idx_payments_appointment_id", table_name="payments")
    op.drop_index("idx_payments_status_due", table_name="payments")
    op.drop_index("idx_payments_patient_status", table_name="payments")
    op.drop_table("payments")
