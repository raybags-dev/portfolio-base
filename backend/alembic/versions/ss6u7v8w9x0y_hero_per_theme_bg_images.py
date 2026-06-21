"""hero: per-theme background images (dark/light)

Revision ID: ss6u7v8w9x0y
Revises: rr5t6u7v8w9x
Create Date: 2026-06-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "ss6u7v8w9x0y"
down_revision = "rr5t6u7v8w9x"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hero_section",
        sa.Column("background_image_url_dark", sa.String(1024), nullable=True),
    )
    op.add_column(
        "hero_section",
        sa.Column("background_image_url_light", sa.String(1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("hero_section", "background_image_url_light")
    op.drop_column("hero_section", "background_image_url_dark")
