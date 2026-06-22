"""site_configuration: per-theme logo images (dark/light)

Revision ID: vv9w0x1y2z3a
Revises: uu8v9w0x1y2z
Create Date: 2026-06-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "vv9w0x1y2z3a"
down_revision = "uu8v9w0x1y2z"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("site_configuration", sa.Column("logo_url_dark", sa.String(1024), nullable=True))
    op.add_column("site_configuration", sa.Column("logo_url_light", sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column("site_configuration", "logo_url_light")
    op.drop_column("site_configuration", "logo_url_dark")
