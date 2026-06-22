"""Add maintenance_theme and maintenance_logo_url to site_configuration

Revision ID: yy2z3a4b5c6d
Revises: xx1y2z3a4b5c
Create Date: 2026-06-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "yy2z3a4b5c6d"
down_revision = "xx1y2z3a4b5c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("site_configuration") as batch_op:
        batch_op.add_column(
            sa.Column("maintenance_theme", sa.String(8), nullable=True, server_default="dark")
        )
        batch_op.add_column(
            sa.Column("maintenance_logo_url", sa.String(1024), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("site_configuration") as batch_op:
        batch_op.drop_column("maintenance_logo_url")
        batch_op.drop_column("maintenance_theme")
