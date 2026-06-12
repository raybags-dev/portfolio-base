"""add project_url to blog_posts

Revision ID: ii5j6k7l8m9n
Revises: hh4i5j6k7l8m
Create Date: 2026-06-12

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = 'ii5j6k7l8m9n'
down_revision: str | None = 'hh4i5j6k7l8m'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('blog_posts', sa.Column('project_url', sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column('blog_posts', 'project_url')
