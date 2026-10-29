"""App tokens become app-scoped multi-use tryout passes (24h, quota-limited).

Adds app_name / max_uses / uses to app_tokens. Existing rows keep
app_name=NULL and max_uses=1, which preserves the legacy single-use,
any-app behavior exactly.

Revision ID: bb1c2d3e4f5a
Revises: aaa0b1c2d3e4
Create Date: 2026-10-29
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "bb1c2d3e4f5a"
down_revision = "aaa0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent (dialect-agnostic): restored/backup databases may already
    # carry these columns. Uses SQLAlchemy inspection, not information_schema.
    conn = op.get_bind()
    existing = {col["name"] for col in sa.inspect(conn).get_columns("app_tokens")}
    existing_indexes = {idx["name"] for idx in sa.inspect(conn).get_indexes("app_tokens")}

    if "app_name" not in existing:
        op.add_column("app_tokens", sa.Column("app_name", sa.String(length=64), nullable=True))
    if "max_uses" not in existing:
        op.add_column(
            "app_tokens",
            sa.Column("max_uses", sa.Integer(), server_default="1", nullable=False),
        )
    if "uses" not in existing:
        op.add_column(
            "app_tokens",
            sa.Column("uses", sa.Integer(), server_default="0", nullable=False),
        )
    if "ix_app_tokens_app_name" not in existing_indexes:
        op.create_index("ix_app_tokens_app_name", "app_tokens", ["app_name"])


def downgrade() -> None:
    op.drop_index("ix_app_tokens_app_name", table_name="app_tokens")
    op.drop_column("app_tokens", "uses")
    op.drop_column("app_tokens", "max_uses")
    op.drop_column("app_tokens", "app_name")
