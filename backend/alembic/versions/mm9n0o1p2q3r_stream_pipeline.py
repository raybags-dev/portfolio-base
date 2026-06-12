"""add stream pipeline tables (topics, events, alert_rules, alert_fired)

Revision ID: mm9n0o1p2q3r
Revises: ll8m9n0o1p2q
Create Date: 2026-06-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "mm9n0o1p2q3r"
down_revision = "ll8m9n0o1p2q"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stream_topics",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(128), nullable=False, unique=True),
        sa.Column("description", sa.String(512), nullable=True),
        sa.Column("source_key", sa.String(64), nullable=True),
        sa.Column("event_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_stream_topics_name", "stream_topics", ["name"])

    op.create_table(
        "stream_events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("topic_name", sa.String(128),
                  sa.ForeignKey("stream_topics.name", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_stream_events_topic_name", "stream_events", ["topic_name"])
    op.create_index("ix_stream_events_created_at", "stream_events", ["created_at"])

    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("topic_name", sa.String(128),
                  sa.ForeignKey("stream_topics.name", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("field_path", sa.String(128), nullable=False),
        sa.Column("operator", sa.String(16), nullable=False),
        sa.Column("threshold", sa.String(256), nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_alert_rules_topic_name", "alert_rules", ["topic_name"])

    op.create_table(
        "alert_fired",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("rule_id", sa.Integer,
                  sa.ForeignKey("alert_rules.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("event_snapshot", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_alert_fired_rule_id", "alert_fired", ["rule_id"])
    op.create_index("ix_alert_fired_created_at", "alert_fired", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_alert_fired_created_at", "alert_fired")
    op.drop_index("ix_alert_fired_rule_id", "alert_fired")
    op.drop_table("alert_fired")

    op.drop_index("ix_alert_rules_topic_name", "alert_rules")
    op.drop_table("alert_rules")

    op.drop_index("ix_stream_events_created_at", "stream_events")
    op.drop_index("ix_stream_events_topic_name", "stream_events")
    op.drop_table("stream_events")

    op.drop_index("ix_stream_topics_name", "stream_topics")
    op.drop_table("stream_topics")
