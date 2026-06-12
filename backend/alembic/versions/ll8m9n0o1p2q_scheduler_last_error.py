"""add last_error to scheduled_jobs

Revision ID: ll8m9n0o1p2q
Revises: kk7l8m9n0o1p
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "ll8m9n0o1p2q"
down_revision = "kk7l8m9n0o1p"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("scheduled_jobs") as batch_op:
        batch_op.add_column(sa.Column("last_error", sa.Text, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("scheduled_jobs") as batch_op:
        batch_op.drop_column("last_error")
