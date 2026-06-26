"""enhance skill fields

Revision ID: aaa0b1c2d3e4
Revises: zz3a4b5c6d7e
Create Date: 2026-06-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "aaa0b1c2d3e4"
down_revision = "aaa1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("skills", sa.Column("status", sa.String(64), nullable=True))
    op.add_column("skills", sa.Column("experience", sa.String(64), nullable=True))
    op.add_column("skills", sa.Column("primary_use", sa.String(255), nullable=True))
    op.add_column("skills", sa.Column("related_technologies", sa.JSON(), nullable=True))
    op.add_column("skills", sa.Column("project_title", sa.String(255), nullable=True))
    op.add_column("skills", sa.Column("project_url", sa.String(512), nullable=True))
    op.add_column(
        "skills",
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    for col in [
        "status",
        "experience",
        "primary_use",
        "related_technologies",
        "project_title",
        "project_url",
        "featured",
    ]:
        op.drop_column("skills", col)
