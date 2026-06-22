"""Seed DataForge ELT microservice and project card

Revision ID: ww0x1y2z3a4b
Revises: vv9w0x1y2z3a
Create Date: 2026-06-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "ww0x1y2z3a4b"
down_revision = "vv9w0x1y2z3a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO microservices (key, name, description, category, icon, base_url, status, is_public, created_at, updated_at)
            VALUES (
                'dataforge-elt',
                'DataForge ELT',
                'Production-quality ELT pipeline: Playwright crawlers, DuckDB warehouse, dbt transformations, and a React dashboard.',
                'data-engineering',
                'database',
                '/dataforge',
                'active',
                true,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (key) DO NOTHING
            """
        )
    )

    op.execute(
        sa.text(
            """
            INSERT INTO projects (title, slug, summary, description, github_url, demo_url, status, tech_tags, is_featured, is_hidden, "order", service_key, created_at, updated_at)
            VALUES (
                'DataForge ELT',
                'dataforge-elt',
                'An end-to-end ELT pipeline with web crawlers, a DuckDB warehouse, dbt transformations, and live React dashboard.',
                'DataForge is a production-quality data engineering platform. It crawls multiple sources via Playwright, lands raw data into a partitioned data lake, transforms it with dbt + DuckDB, and exposes the results through a FastAPI backend and a React UI — all deployable on a single VPS.',
                'https://github.com/raybags-dev/DataForge-ELT',
                '/dataforge',
                'published',
                '["Python", "FastAPI", "DuckDB", "dbt", "React", "Docker", "Playwright"]',
                true,
                false,
                10,
                'dataforge-elt',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (slug) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM projects WHERE slug = 'dataforge-elt'")
    )
    op.execute(
        sa.text("DELETE FROM microservices WHERE key = 'dataforge-elt'")
    )
