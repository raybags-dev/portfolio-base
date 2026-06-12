"""ude_sessions.source_url: String(4096) -> Text (supports large paste data)

Revision ID: jj6k7l8m9n0o
Revises: ii5j6k7l8m9n
Create Date: 2026-06-12

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "jj6k7l8m9n0o"
down_revision: str | None = "ii5j6k7l8m9n"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("ude_sessions") as batch_op:
        batch_op.alter_column(
            "source_url",
            existing_type=sa.String(4096),
            type_=sa.Text(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("ude_sessions") as batch_op:
        batch_op.alter_column(
            "source_url",
            existing_type=sa.Text(),
            type_=sa.String(4096),
            existing_nullable=False,
        )
