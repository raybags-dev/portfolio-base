"""sections: per-theme background images (dark/light)

Revision ID: tt7v8w9x0y1z
Revises: ss6u7v8w9x0y
Create Date: 2026-06-21
"""
from __future__ import annotations
import sqlalchemy as sa
from alembic import op

revision = "tt7v8w9x0y1z"
down_revision = "ss6u7v8w9x0y"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("sections", sa.Column("background_image_url_dark", sa.String(1024), nullable=True))
    op.add_column("sections", sa.Column("background_image_url_light", sa.String(1024), nullable=True))

def downgrade() -> None:
    op.drop_column("sections", "background_image_url_light")
    op.drop_column("sections", "background_image_url_dark")
