"""VOD pipeline broker: business logic.

The platform never touches video bytes - it presigns bounded PUT uploads
(token-gated, quota-limited) and mirrors the AWS-side job status from
DynamoDB into local vod_jobs rows for attribution and admin views.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Setting
from app.models.platform import VodJob
from app.modules.vod_pipeline import aws_broker

_CONFIG_KEY = "vod_pipeline_config"

# Public caps (also surfaced via GET /config so the frontend never hardcodes).
MAX_UPLOAD_MB = 100
ALLOWED_CONTENT_TYPES = ("video/mp4", "video/quicktime", "video/x-matroska")
ALLOWED_EXTENSIONS = (".mp4", ".mov", ".mkv")
QUOTA_PER_TOKEN = 2  # matches TRYOUT_APPS["vod-pipeline"].max_uses
PRESIGN_TTL_SECONDS = 900

_CONFIG_FIELDS = (
    "region",
    "raw_bucket",
    "processed_bucket",
    "jobs_table",
    "cloudfront_domain",
    "access_key_id",
    "secret_access_key",
)


async def get_config(db: AsyncSession) -> dict[str, Any]:
    row = await db.scalar(select(Setting).where(Setting.key == _CONFIG_KEY))
    if row is None or not isinstance(row.value, dict):
        return {}
    return {k: v for k, v in row.value.items() if k in _CONFIG_FIELDS}


async def save_config(db: AsyncSession, cfg: dict[str, Any]) -> dict[str, Any]:
    clean = {k: v for k, v in cfg.items() if k in _CONFIG_FIELDS and v is not None}
    row = await db.scalar(select(Setting).where(Setting.key == _CONFIG_KEY))
    if row is None:
        row = Setting(key=_CONFIG_KEY, value={}, group="aws", is_public=False)
        db.add(row)
    row.value = clean
    await db.commit()
    return clean


def is_deployed(cfg: dict[str, Any]) -> bool:
    return bool(cfg.get("raw_bucket") and cfg.get("jobs_table") and cfg.get("cloudfront_domain"))


def public_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """Non-secret subset for the public /config endpoint."""
    return {
        "deployed": is_deployed(cfg),
        # Token-only tryout: only admin-approved keys can spend MediaConvert
        # minutes. There is no anonymous free run for this app.
        "requires_token": True,
        "max_upload_mb": MAX_UPLOAD_MB,
        "allowed_content_types": list(ALLOWED_CONTENT_TYPES),
        "allowed_extensions": list(ALLOWED_EXTENSIONS),
        "quota_per_token": QUOTA_PER_TOKEN,
        "cloudfront_domain": cfg.get("cloudfront_domain") or None,
    }


def sanitize_filename(name: str) -> str:
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", base)
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    cleaned = re.sub(r"-+\.", ".", cleaned)
    cleaned = cleaned.strip("-.")
    return cleaned[:120] or "upload.mp4"


def validate_upload(filename: str, size_bytes: int, content_type: str) -> str | None:
    """Return an error string when invalid, else None."""
    if size_bytes <= 0:
        return "size_bytes must be positive"
    if size_bytes > MAX_UPLOAD_MB * 1024 * 1024:
        return f"file exceeds the {MAX_UPLOAD_MB} MB tryout limit"
    if content_type not in ALLOWED_CONTENT_TYPES:
        return f"content_type must be one of {', '.join(ALLOWED_CONTENT_TYPES)}"
    if not filename.lower().endswith(ALLOWED_EXTENSIONS):
        return f"file extension must be one of {', '.join(ALLOWED_EXTENSIONS)}"
    return None


async def create_upload(
    db: AsyncSession,
    cfg: dict[str, Any],
    *,
    filename: str,
    size_bytes: int,
    content_type: str,
    client_ip: str | None,
    is_guest: bool,
    token_id: int | None,
) -> tuple[VodJob, dict[str, Any]]:
    job_id = uuid.uuid4().hex[:12]
    s3_key = f"tryout/{job_id}/{sanitize_filename(filename)}"
    signed = await aws_broker.presign_put(
        cfg,
        key=s3_key,
        content_type=content_type,
        max_bytes=MAX_UPLOAD_MB * 1024 * 1024,
        ttl_seconds=PRESIGN_TTL_SECONDS,
    )
    job = VodJob(
        job_id=job_id,
        token_id=token_id,
        client_ip=client_ip,
        is_guest=is_guest,
        filename=sanitize_filename(filename),
        size_bytes=size_bytes,
        s3_key=s3_key,
        status="PENDING_UPLOAD",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job, signed


_FINAL_STATES = {"COMPLETE", "ERROR"}


async def sync_job(db: AsyncSession, cfg: dict[str, Any], job: VodJob) -> VodJob:
    """Read-through status sync from DynamoDB (skips terminal states)."""
    if job.status in _FINAL_STATES or not is_deployed(cfg):
        return job
    if not aws_broker.is_aws_available(cfg):
        return job
    try:
        item = await aws_broker.fetch_job(cfg, job.job_id)
    except Exception:
        return job  # AWS hiccup - serve the stale row, never 500 a poll
    parsed = aws_broker.parse_job_item(item)
    if parsed is None:
        return job
    new_status = parsed.get("status")
    if new_status and new_status != job.status:
        job.status = new_status
    if parsed.get("stream_url"):
        job.stream_url = parsed["stream_url"]
    if parsed.get("error"):
        job.error = parsed["error"]
    await db.commit()
    await db.refresh(job)
    return job


async def usage_counters(db: AsyncSession) -> dict[str, Any]:
    total = await db.scalar(select(func.count(VodJob.id))) or 0
    by_status_rows = (
        await db.execute(select(VodJob.status, func.count(VodJob.id)).group_by(VodJob.status))
    ).all()
    total_bytes = await db.scalar(select(func.coalesce(func.sum(VodJob.size_bytes), 0))) or 0
    return {
        "total_jobs": total,
        "by_status": {status: count for status, count in by_status_rows},
        "total_upload_mb": round(total_bytes / (1024 * 1024), 2),
    }


def job_dict(job: VodJob) -> dict[str, Any]:
    return {
        "job_id": job.job_id,
        "filename": job.filename,
        "size_mb": round(job.size_bytes / (1024 * 1024), 2),
        "status": job.status,
        "stream_url": job.stream_url,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }
