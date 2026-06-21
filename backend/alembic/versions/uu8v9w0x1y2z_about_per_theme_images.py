"""about: per-theme profile images (dark/light)

Revision ID: uu8v9w0x1y2z
Revises: tt7v8w9x0y1z
Create Date: 2026-06-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "uu8v9w0x1y2z"
down_revision = "tt7v8w9x0y1z"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("about_me", sa.Column("image_url_dark", sa.String(1024), nullable=True))
    op.add_column("about_me", sa.Column("image_url_light", sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column("about_me", "image_url_light")
    op.drop_column("about_me", "image_url_dark")
