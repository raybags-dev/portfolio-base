"""Audio API broker: business logic + config storage.

The platform never touches audio bytes - it brokers admin operations to the
AWS API Gateway (with the SSM-stored admin key) and presigns bounded audio
uploads for admins. Public reads hit the API GW directly from the browser.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Setting

_CONFIG_KEY = "audio_api_config"

MAX_UPLOAD_MB = 50
ALLOWED_AUDIO_TYPES = ("audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm")
ALLOWED_EXTENSIONS = (".mp3", ".m4a", ".wav", ".ogg", ".webm")
PRESIGN_TTL_SECONDS = 900
TRYOUT_QUOTA = 50

_CONFIG_FIELDS = (
    "region",
    "api_url",
    "tracks_table",
    "progress_table",
    "audio_bucket",
    "admin_key_param",
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
    return bool(cfg.get("api_url") and cfg.get("audio_bucket"))


def public_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """Non-secret subset for the public /config endpoint (drives the frontend)."""
    return {
        "deployed": is_deployed(cfg),
        # Public reads are near-zero cost - the demo is open; only uploads and
        # admin writes are gated (via the platform admin panel, not tokens).
        "requires_token": False,
        "api_url": cfg.get("api_url") or None,
        "max_upload_mb": MAX_UPLOAD_MB,
        "allowed_content_types": list(ALLOWED_AUDIO_TYPES),
        "allowed_extensions": list(ALLOWED_EXTENSIONS),
        "quota_per_token": TRYOUT_QUOTA,
    }


def sanitize_filename(name: str) -> str:
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", base)
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    cleaned = re.sub(r"-+\.", ".", cleaned)
    cleaned = cleaned.strip("-.")
    return cleaned[:120] or "track.mp3"


def validate_upload(filename: str, size_bytes: int, content_type: str) -> str | None:
    if size_bytes <= 0:
        return "size_bytes must be positive"
    if size_bytes > MAX_UPLOAD_MB * 1024 * 1024:
        return f"file exceeds the {MAX_UPLOAD_MB} MB limit"
    if content_type not in ALLOWED_AUDIO_TYPES:
        return f"content_type must be one of {', '.join(ALLOWED_AUDIO_TYPES)}"
    if not filename.lower().endswith(ALLOWED_EXTENSIONS):
        return f"file extension must be one of {', '.join(ALLOWED_EXTENSIONS)}"
    return None
