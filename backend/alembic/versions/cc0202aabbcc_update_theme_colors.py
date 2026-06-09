"""Update theme primary/secondary colors to red-based palette.

Revision ID: cc0202aabbcc
Revises: da1daa73c50a
Create Date: 2026-06-09
"""

from __future__ import annotations

from alembic import op

revision: str = "cc0202aabbcc"
down_revision: str | None = "da1daa73c50a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE themes SET primary_color = '#CC0202', secondary_color = '#FF6B6B'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE themes SET primary_color = '#6366f1', secondary_color = '#22d3ee'"
    )
