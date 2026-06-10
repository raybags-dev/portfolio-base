"""app_tokens and ip_usage_logs — access control for per-IP rate limiting

Revision ID: cc3d4e5f6a7b
Revises: aa2b3c4d5e6f
Create Date: 2026-06-10 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "cc3d4e5f6a7b"
down_revision: Union[str, None] = "aa2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("used_by_ip", sa.String(length=64), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_app_tokens_token", "app_tokens", ["token"])

    op.create_table(
        "ip_usage_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("app_name", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ip", "app_name", name="uq_ip_app_usage"),
    )
    op.create_index("ix_ip_usage_logs_ip", "ip_usage_logs", ["ip"])


def downgrade() -> None:
    op.drop_index("ix_ip_usage_logs_ip", table_name="ip_usage_logs")
    op.drop_table("ip_usage_logs")
    op.drop_index("ix_app_tokens_token", table_name="app_tokens")
    op.drop_table("app_tokens")
