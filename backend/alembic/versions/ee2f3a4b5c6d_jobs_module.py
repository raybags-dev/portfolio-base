"""jobs module: tables, project card, microservice record, placeholder flags

Revision ID: ee2f3a4b5c6d
Revises: bb2cc3dd4ee5
Create Date: 2026-06-12 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'ee2f3a4b5c6d'
down_revision: Union[str, None] = 'bb2cc3dd4ee5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Job crawl tables ────────────────────────────────────────────────────
    op.create_table(
        "job_crawl_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("target_url", sa.String(2048), nullable=False),
        sa.Column("collection_prompt", sa.Text(), nullable=False),
        sa.Column("analytics_spec", sa.JSON(), nullable=True),
        sa.Column("max_pages", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("progress", sa.JSON(), nullable=True),
        sa.Column("analytics_result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("client_ip", sa.String(64), nullable=True),
        sa.Column("is_guest", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("session_contact", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "job_crawl_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("job_crawl_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("source_url", sa.String(2048), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("validation_errors", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    conn = op.get_bind()

    # ── Enable the jobs feature flag ────────────────────────────────────────
    conn.execute(sa.text(
        "UPDATE feature_flags SET enabled = true WHERE key = 'ENABLE_JOBS'"
    ))

    # ── Jobs microservice record ────────────────────────────────────────────
    ms_exists = conn.execute(
        sa.text("SELECT 1 FROM microservices WHERE key = 'jobs'")
    ).fetchone()
    if not ms_exists:
        conn.execute(sa.text("""
            INSERT INTO microservices
              (key, name, description, category, feature_flag_key,
               base_url, status, is_public, created_at, updated_at)
            VALUES (
              'jobs',
              'Job Market Analytics',
              'Point the LLM crawler at any job board — Indeed, RemoteOK, company careers pages — and get instant skill-demand charts, salary distributions, and hiring-trend insights.',
              'data',
              'ENABLE_JOBS',
              '/job-analytics',
              'live',
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))
    else:
        conn.execute(sa.text(
            "UPDATE microservices SET base_url = '/job-analytics', status = 'live' "
            "WHERE key = 'jobs'"
        ))

    # ── Jobs project card ───────────────────────────────────────────────────
    proj_exists = conn.execute(
        sa.text("SELECT 1 FROM projects WHERE slug = 'job-market-analytics'")
    ).fetchone()
    if not proj_exists:
        conn.execute(sa.text("""
            INSERT INTO projects
              (title, slug, summary, description, tech_tags,
               is_featured, is_hidden, status, service_key, "order",
               created_at, updated_at)
            VALUES (
              'Job Market Analytics',
              'job-market-analytics',
              'LLM-guided crawler for any job board — extracts listings, parses skills, salary ranges and seniority levels, then renders interactive analytics charts.',
              'Playwright navigates job boards (Indeed, RemoteOK, company careers pages) guided by Groq AI. Extracts structured job data, runs skill-demand frequency analysis, salary histograms, work-arrangement breakdowns, and auto-generates market-trend blog posts.',
              '["Playwright","Groq AI","FastAPI","Next.js","Recharts","SQLAlchemy","Python"]',
              true,
              false,
              'published',
              'jobs',
              3,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))

    # ── Placeholder microservice: Universal Data Extractor ──────────────────
    ue_exists = conn.execute(
        sa.text("SELECT 1 FROM microservices WHERE key = 'universal-extractor'")
    ).fetchone()
    if not ue_exists:
        conn.execute(sa.text("""
            INSERT INTO microservices
              (key, name, description, category, feature_flag_key,
               base_url, status, is_public, created_at, updated_at)
            VALUES (
              'universal-extractor',
              'Universal Data Extractor',
              'Provide any URL — the engine maps every data point on the page, auto-detects scroll vs pagination, extracts all endpoints and structured datasets, and uses the LLM to annotate and categorise them.',
              'data',
              'ENABLE_UNIVERSAL_EXTRACTOR',
              NULL,
              'registered',
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))

    ue_proj = conn.execute(
        sa.text("SELECT 1 FROM projects WHERE slug = 'universal-data-extractor'")
    ).fetchone()
    if not ue_proj:
        conn.execute(sa.text("""
            INSERT INTO projects
              (title, slug, summary, description, tech_tags,
               is_featured, is_hidden, status, service_key, "order",
               created_at, updated_at)
            VALUES (
              'Universal Data Extractor',
              'universal-data-extractor',
              'Point it at any URL — it extracts every data point, auto-navigates scroll & pagination, maps API endpoints, and exports LLM-annotated structured datasets.',
              'The grand-master extractor: provide a URL and it auto-detects whether the page loads via infinite scroll or pagination, maps all visible data including endpoints and hidden JSON payloads, and uses the LLM to produce a clean annotated dataset ready for analysis.',
              '["Playwright","Groq AI","FastAPI","Next.js","Python"]',
              false,
              false,
              'published',
              'universal-extractor',
              10,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))

    # ── Placeholder microservice: Real-Time Stream Pipeline (Kafka) ─────────
    sp_exists = conn.execute(
        sa.text("SELECT 1 FROM microservices WHERE key = 'stream-pipeline'")
    ).fetchone()
    if not sp_exists:
        conn.execute(sa.text("""
            INSERT INTO microservices
              (key, name, description, category, feature_flag_key,
               base_url, status, is_public, created_at, updated_at)
            VALUES (
              'stream-pipeline',
              'Real-Time Stream Pipeline',
              'Kafka-powered event bus: crawl results, job listings, and analytics events are published as topics and consumed by real-time workers — enabling live dashboards and streaming ML inference.',
              'infra',
              'ENABLE_STREAM_PIPELINE',
              NULL,
              'registered',
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))

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
              11,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE feature_flags SET enabled = false WHERE key = 'ENABLE_JOBS'"
    ))
    conn.execute(sa.text("DELETE FROM projects WHERE slug = 'job-market-analytics'"))
    conn.execute(sa.text("DELETE FROM projects WHERE slug = 'universal-data-extractor'"))
    conn.execute(sa.text("DELETE FROM projects WHERE slug = 'stream-pipeline'"))
    conn.execute(sa.text("DELETE FROM microservices WHERE key = 'jobs'"))
    conn.execute(sa.text("DELETE FROM microservices WHERE key = 'universal-extractor'"))
    conn.execute(sa.text("DELETE FROM microservices WHERE key = 'stream-pipeline'"))
    op.drop_table("job_crawl_records")
    op.drop_table("job_crawl_sessions")
