"""vod pipeline module: vod_jobs table, flag, microservice + project card

Revision ID: cc2d3e4f5a6b
Revises: bb1c2d3e4f5a
Create Date: 2026-10-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "cc2d3e4f5a6b"
down_revision = "bb1c2d3e4f5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vod_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.String(64), nullable=False),
        sa.Column(
            "token_id",
            sa.Integer(),
            sa.ForeignKey("app_tokens.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("client_ip", sa.String(64), nullable=True),
        sa.Column("is_guest", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("s3_key", sa.String(512), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING_UPLOAD"),
        sa.Column("stream_url", sa.String(1024), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_vod_jobs_job_id", "vod_jobs", ["job_id"], unique=True)
    op.create_index("ix_vod_jobs_token_id", "vod_jobs", ["token_id"])

    conn = op.get_bind()

    # ── microservice record (base_url wires project cards -> tryout page) ────
    ms_exists = conn.execute(
        sa.text("SELECT 1 FROM microservices WHERE key = 'vod-pipeline'")
    ).fetchone()
    if not ms_exists:
        conn.execute(sa.text("""
            INSERT INTO microservices
              (key, name, description, category, feature_flag_key,
               base_url, status, is_public, created_at, updated_at)
            VALUES (
              'vod-pipeline',
              'VOD & HLS Packaging Pipeline',
              'Serverless video-on-demand pipeline: upload an mp4, AWS MediaConvert transcodes it to adaptive HLS, and it streams back through CloudFront. Fully token-gated tryout.',
              'cloud',
              'ENABLE_VOD_PIPELINE',
              '/vod-pipeline',
              'live',
              true,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))

    # ── project card ─────────────────────────────────────────────────────────
    proj_exists = conn.execute(
        sa.text("SELECT 1 FROM projects WHERE slug = 'vod-hls-pipeline'")
    ).fetchone()
    if not proj_exists:
        conn.execute(sa.text("""
            INSERT INTO projects
              (title, slug, summary, description, tech_tags,
               is_featured, is_hidden, status, service_key, "order",
               created_at, updated_at)
            VALUES (
              'VOD & HLS Packaging Pipeline',
              'vod-hls-pipeline',
              'Serverless video-on-demand pipeline: S3 raw uploads trigger AWS MediaConvert jobs that package adaptive HLS streams served via CloudFront with OAC.',
              'Upload an mp4 through a token-gated presigned S3 URL. An S3 event triggers a Lambda that submits a single-pass H.264/AAC MediaConvert job (720p/1080p cost-capped), packaging multi-rendition HLS into a private bucket fronted by CloudFront Origin Access Control. EventBridge completion events update job status in DynamoDB; the platform polls and plays the stream.',
              '["TypeScript","AWS MediaConvert","AWS Lambda","S3","CloudFront OAC","DynamoDB","EventBridge","Terraform","FastAPI","Next.js"]',
              true,
              false,
              'published',
              'vod-pipeline',
              2,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM projects WHERE slug = 'vod-hls-pipeline'"))
    conn.execute(sa.text("DELETE FROM microservices WHERE key = 'vod-pipeline'"))
    op.drop_index("ix_vod_jobs_token_id", table_name="vod_jobs")
    op.drop_index("ix_vod_jobs_job_id", table_name="vod_jobs")
    op.drop_table("vod_jobs")
