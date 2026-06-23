"""Add ai_context column to site_configuration for chat LLM personalisation

Revision ID: aaa1b2c3d4e5
Revises: zz3a4b5c6d7e
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "aaa1b2c3d4e5"
down_revision = "zz3a4b5c6d7e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("site_configuration") as batch_op:
        batch_op.add_column(sa.Column("ai_context", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("site_configuration") as batch_op:
        batch_op.drop_column("ai_context")
