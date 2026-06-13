"""set stream-pipeline microservice to active with /streams base_url

Revision ID: nn0o1p2q3r4s
Revises: mm9n0o1p2q3r
Create Date: 2026-06-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "nn0o1p2q3r4s"
down_revision = "mm9n0o1p2q3r"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE microservices SET status = 'active', base_url = '/streams' "
            "WHERE key = 'stream-pipeline'"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE microservices SET status = 'registered', base_url = NULL "
            "WHERE key = 'stream-pipeline'"
        )
    )
