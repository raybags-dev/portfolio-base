"""Universal Data Extractor: tables, feature flag, microservice, project cards

Revision ID: gg3h4i5j6k7l
Revises: ee2f3a4b5c6d
Create Date: 2026-06-12 14:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'gg3h4i5j6k7l'
down_revision: Union[str, None] = 'ee2f3a4b5c6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── UDE tables ───────────────────────────────────────────────────────────
    op.create_table(
        "ude_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_url", sa.String(4096), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="auto"),
        sa.Column("source_type_detected", sa.String(32), nullable=True),
        sa.Column("extraction_prompt", sa.Text(), nullable=False, server_default="Extract all structured data."),
        sa.Column("source_config", sa.JSON(), nullable=True),
        sa.Column("analytics_spec", sa.JSON(), nullable=True),
        sa.Column("max_records", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("progress", sa.JSON(), nullable=True),
        sa.Column("analytics_result", sa.JSON(), nullable=True),
        sa.Column("schema_detected", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("client_ip", sa.String(64), nullable=True),
        sa.Column("is_guest", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("session_contact", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "ude_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("ude_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("source_url", sa.String(4096), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("normalised_data", sa.JSON(), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("validation_errors", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    conn = op.get_bind()

    # ── Feature flag ─────────────────────────────────────────────────────────
    flag_exists = conn.execute(
        sa.text("SELECT 1 FROM feature_flags WHERE key = 'ENABLE_UNIVERSAL_EXTRACTOR'")
    ).fetchone()
    if not flag_exists:
        conn.execute(sa.text("""
            INSERT INTO feature_flags (key, enabled, label, description, "group", config, created_at, updated_at)
            VALUES (
              'ENABLE_UNIVERSAL_EXTRACTOR', true,
              'Universal Data Extractor',
              'Point it at any URL or paste raw data — auto-detects source type, extracts records, normalises schema via LLM, and runs analytics.',
              'data',
              '{}',
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """))
    else:
        conn.execute(sa.text(
            "UPDATE feature_flags SET enabled = true WHERE key = 'ENABLE_UNIVERSAL_EXTRACTOR'"
        ))

    # ── Microservice record ───────────────────────────────────────────────────
    ms_exists = conn.execute(
        sa.text("SELECT 1 FROM microservices WHERE key = 'universal-extractor'")
    ).fetchone()
    if not ms_exists:
        conn.execute(sa.text("""
            INSERT INTO microservices
              (key, name, description, category, feature_flag_key,
               base_url, status, is_public, created_at, updated_at)
            VALUES (
              'universal-extractor',
              'Universal Data Extractor',
              'Point it at any URL, API endpoint, CSV, JSON, or Kaggle dataset — the engine auto-detects the source type, extracts all records, normalises to a unified schema via LLM, validates, and renders instant analytics.',
              'data',
              'ENABLE_UNIVERSAL_EXTRACTOR',
              '/universal-extractor',
              'live',
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))
    else:
        conn.execute(sa.text(
            "UPDATE microservices SET base_url = '/universal-extractor', status = 'live' "
            "WHERE key = 'universal-extractor'"
        ))

    # ── Project card: Universal Data Extractor ────────────────────────────────
    proj_exists = conn.execute(
        sa.text("SELECT 1 FROM projects WHERE slug = 'universal-data-extractor'")
    ).fetchone()
    if not proj_exists:
        conn.execute(sa.text("""
            INSERT INTO projects
              (title, slug, summary, description, tech_tags,
               is_featured, is_hidden, status, service_key, "order",
               created_at, updated_at)
            VALUES (
              'Universal Data Extractor',
              'universal-data-extractor',
              'Point it at any URL — it extracts every data point, auto-navigates scroll & pagination, maps API endpoints, and exports LLM-annotated structured datasets.',
              'Accepts web pages, REST/GraphQL APIs, CSV/JSON files, or Kaggle datasets. Auto-detects source type, runs deterministic extraction first (CSS selectors, JSONPath, table parsing), falls back to Playwright + Groq AI for JS-heavy pages, normalises all fields to a unified schema, validates, and renders interactive analytics charts.',
              '["Playwright","Groq AI","FastAPI","Next.js","Recharts","SQLAlchemy","Python","httpx"]',
              true,
              false,
              'published',
              'universal-extractor',
              4,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))
    else:
        conn.execute(sa.text(
            "UPDATE projects SET status = 'published', service_key = 'universal-extractor' "
            "WHERE slug = 'universal-data-extractor'"
        ))

    # ── Project card: Real-Time Stream Pipeline ───────────────────────────────
    sp_proj = conn.execute(
        sa.text("SELECT 1 FROM projects WHERE slug = 'stream-pipeline'")
    ).fetchone()
    if not sp_proj:
        conn.execute(sa.text("""
            INSERT INTO projects
              (title, slug, summary, description, tech_tags,
               is_featured, is_hidden, status, service_key, "order",
               created_at, updated_at)
            VALUES (
              'Real-Time Stream Pipeline',
              'stream-pipeline',
              'Kafka event bus connecting crawlers, analytics workers, and live dashboards — each data source publishes events, consumers react in real time.',
              'Kafka topics wire together all data-engineering modules: job listings, news articles, and price data are published as events. Stream-processing consumers run analytics, trigger alerts, and feed the live dashboard without any polling.',
              '["Kafka","FastAPI","Next.js","Python","SQLAlchemy"]',
              false,
              false,
              'published',
              'stream-pipeline',
              5,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))

    # ── Stream Pipeline microservice placeholder ──────────────────────────────
    sp_ms = conn.execute(
        sa.text("SELECT 1 FROM microservices WHERE key = 'stream-pipeline'")
    ).fetchone()
    if not sp_ms:
        conn.execute(sa.text("""
            INSERT INTO microservices
              (key, name, description, category, feature_flag_key,
               base_url, status, is_public, created_at, updated_at)
            VALUES (
              'stream-pipeline',
              'Real-Time Stream Pipeline',
              'Kafka-powered event bus: crawl results and analytics events published as topics, consumed by real-time workers for live dashboards.',
              'infra',
              'ENABLE_STREAM_PIPELINE',
              NULL,
              'registered',
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE feature_flags SET enabled = false WHERE key = 'ENABLE_UNIVERSAL_EXTRACTOR'"
    ))
    conn.execute(sa.text("DELETE FROM projects WHERE slug = 'universal-data-extractor'"))
    conn.execute(sa.text("DELETE FROM microservices WHERE key = 'universal-extractor'"))
    op.drop_table("ude_records")
    op.drop_table("ude_sessions")
