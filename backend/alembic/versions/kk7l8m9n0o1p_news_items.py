"""add news_items table

Revision ID: kk7l8m9n0o1p
Revises: jj6k7l8m9n0o
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "kk7l8m9n0o1p"
down_revision = "jj6k7l8m9n0o"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "news_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("url", sa.String(2048), unique=True, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("image_url", sa.String(2048), nullable=True),
        sa.Column("source", sa.String(128), nullable=False, server_default="CNN"),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("author", sa.String(128), nullable=True),
        sa.Column("published_at", sa.String(64), nullable=True),
        sa.Column("is_breaking", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_news_items_source", "news_items", ["source"])
    op.create_index("ix_news_items_created_at", "news_items", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_news_items_created_at", "news_items")
    op.drop_index("ix_news_items_source", "news_items")
    op.drop_table("news_items")
