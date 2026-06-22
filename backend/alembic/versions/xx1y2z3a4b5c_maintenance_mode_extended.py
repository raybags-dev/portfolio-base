"""Extend maintenance_mode with countdown + title/message + per-theme bg images

Revision ID: xx1y2z3a4b5c
Revises: ww0x1y2z3a4b
Create Date: 2026-06-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "xx1y2z3a4b5c"
down_revision = "ww0x1y2z3a4b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("site_configuration") as batch:
        batch.add_column(sa.Column("maintenance_end_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("maintenance_title", sa.String(255), nullable=True))
        batch.add_column(sa.Column("maintenance_message", sa.Text(), nullable=True))
        batch.add_column(sa.Column("maintenance_bg_image_url", sa.String(1024), nullable=True))
        batch.add_column(sa.Column("maintenance_bg_image_url_dark", sa.String(1024), nullable=True))
        batch.add_column(sa.Column("maintenance_bg_image_url_light", sa.String(1024), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("site_configuration") as batch:
        batch.drop_column("maintenance_bg_image_url_light")
        batch.drop_column("maintenance_bg_image_url_dark")
        batch.drop_column("maintenance_bg_image_url")
        batch.drop_column("maintenance_message")
        batch.drop_column("maintenance_title")
        batch.drop_column("maintenance_end_at")
