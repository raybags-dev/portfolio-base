"""add service_key to blog_posts

Revision ID: e9f3b2d15a77
Revises: da1daa73c50a
Create Date: 2026-06-09

"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e9f3b2d15a77'
down_revision: Union[str, None] = 'da1daa73c50a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('blog_posts', sa.Column('service_key', sa.String(64), nullable=True))
    op.create_index('ix_blog_posts_service_key', 'blog_posts', ['service_key'])


def downgrade() -> None:
    op.drop_index('ix_blog_posts_service_key', table_name='blog_posts')
    op.drop_column('blog_posts', 'service_key')
