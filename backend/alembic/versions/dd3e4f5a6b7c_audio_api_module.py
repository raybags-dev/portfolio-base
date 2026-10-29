"""audio api module: microservice + project card (flag ENABLE_AUDIO_API)

Revision ID: dd3e4f5a6b7c
Revises: cc2d3e4f5a6b
Create Date: 2026-10-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "dd3e4f5a6b7c"
down_revision = "cc2d3e4f5a6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    ms_exists = conn.execute(
        sa.text("SELECT 1 FROM microservices WHERE key = 'audio-api'")
    ).fetchone()
    if not ms_exists:
        conn.execute(sa.text("""
            INSERT INTO microservices
              (key, name, description, category, feature_flag_key,
               base_url, status, is_public, created_at, updated_at)
            VALUES (
              'audio-api',
              'Audio & Podcast Stream API',
              'Serverless REST API for podcast/audio metadata with secure streaming: API Gateway + Express Lambda + DynamoDB, presigned S3 audio playback. Admin-managed track catalog.',
              'cloud',
              'ENABLE_AUDIO_API',
              '/audio-api',
              'live',
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))

    proj_exists = conn.execute(
        sa.text("SELECT 1 FROM projects WHERE slug = 'audio-podcast-api'")
    ).fetchone()
    if not proj_exists:
        conn.execute(sa.text("""
            INSERT INTO projects
              (title, slug, summary, description, tech_tags,
               is_featured, is_hidden, status, service_key, "order",
               created_at, updated_at)
            VALUES (
              'Audio & Podcast Stream API',
              'audio-podcast-api',
              'High-traffic serverless REST API for audio metadata with secure presigned streaming: API Gateway HTTP API fronts an Express Lambda, DynamoDB stores the catalog, S3 holds the audio.',
              'A production-pattern REST API on AWS: paginated track listing with category filtering, presigned 1h S3 stream URLs, Zod-validated admin track registration, and per-listener playback-position sync. TypeScript strict, standardized {success,data} envelope, full Jest coverage.',
              '["TypeScript","Express","AWS Lambda","API Gateway","DynamoDB","S3 Presigned URLs","Terraform","Zod","Jest"]',
              true,
              false,
              'published',
              'audio-api',
              2,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM projects WHERE slug = 'audio-podcast-api'"))
    conn.execute(sa.text("DELETE FROM microservices WHERE key = 'audio-api'"))
