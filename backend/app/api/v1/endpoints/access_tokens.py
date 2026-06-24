"""Admin endpoints for app-access token management and dev-mode whitelist."""

from __future__ import annotations

import json
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.access import _DEV_MODE_KEY, _client_ip
from app.core.deps import DbSession, require_admin
from app.models.content import Setting
from app.models.platform import AppToken, IpUsageLog

router = APIRouter(
    prefix="/access-tokens",
    tags=["access-tokens"],
    dependencies=[Depends(require_admin())],
)

# ── Service-to-service router (no admin JWT required) ────────────────────────

service_router = APIRouter(
    prefix="/access-tokens",
    tags=["access-tokens-service"],
)


class _AccessCheckRequest(BaseModel):
    app_name: str
    ip: str
    token: str | None = None


@service_router.post("/check")
async def check_access(
    body: _AccessCheckRequest,
    db: DbSession,
    x_service_key: str | None = Header(None, alias="X-Service-Key"),
) -> dict[str, Any]:
    """Service-to-service endpoint: validates visitor access on behalf of DataForge.

    Secured by X-Service-Key matching PORTFOLIO_ADMIN_TOKEN env var.
    Mirrors the logic in app.core.access.require_app_access.
    """
    admin_token = os.environ.get("PORTFOLIO_ADMIN_TOKEN") or os.environ.get("ADMIN_TOKEN")
    if not admin_token or x_service_key != admin_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_service_key")

    ip, app_name = body.ip, body.app_name

    # dev-mode whitelist
    setting = await db.scalar(select(Setting).where(Setting.key == _DEV_MODE_KEY))
    if setting:
        try:
            dev_ips: list[str] = json.loads(setting.value or "[]")
            if ip in dev_ips:
                return {"allowed": True}
        except Exception:
            pass

    # first-use is free
    usage = await db.scalar(
        select(IpUsageLog).where(IpUsageLog.ip == ip, IpUsageLog.app_name == app_name)
    )
    if usage is None:
        db.add(IpUsageLog(ip=ip, app_name=app_name))
        await db.commit()
        return {"allowed": True}

    # subsequent uses require a valid token
    if not body.token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "rate_limited")

    now = datetime.now(UTC)
    token = await db.scalar(
        select(AppToken).where(
            AppToken.token == body.token,
            AppToken.is_used.is_(False),
            AppToken.expires_at > now,
        )
    )
    if token is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid_token")

    token.is_used = True
    token.used_by_ip = ip
    token.used_at = now
    await db.commit()
    return {"allowed": True}

_TOKEN_TTL_MINUTES = 1440  # 24 hours — long enough for cross-project chat→token flow


def _token_dict(t: AppToken) -> dict[str, Any]:
    return {
        "id": t.id,
        "token": t.token,
        "created_at": t.created_at,
        "expires_at": t.expires_at,
        "is_used": t.is_used,
        "used_by_ip": t.used_by_ip,
        "used_at": t.used_at,
        "is_expired": t.expires_at < datetime.now(UTC),
    }


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_token(db: DbSession) -> dict[str, Any]:
    """Generate a fresh single-use access token valid for 10 minutes."""
    now = datetime.now(UTC)
    tok = AppToken(
        token=secrets.token_urlsafe(48),
        expires_at=now + timedelta(minutes=_TOKEN_TTL_MINUTES),
    )
    db.add(tok)
    await db.commit()
    await db.refresh(tok)
    return _token_dict(tok)


@router.get("")
async def list_tokens(db: DbSession, limit: int = 50) -> list[dict[str, Any]]:
    """List the most recent tokens (newest first)."""
    rows = (
        await db.scalars(
            select(AppToken).order_by(AppToken.id.desc()).limit(limit)
        )
    ).all()
    return [_token_dict(t) for t in rows]


@router.delete("/{token_id}")
async def revoke_token(token_id: int, db: DbSession) -> Response:
    """Revoke (delete) a token before it is used."""
    tok = await db.get(AppToken, token_id)
    if tok is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    await db.delete(tok)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Dev-mode whitelist ────────────────────────────────────────────────────────

@router.get("/dev-mode")
async def get_dev_mode(request: Request, db: DbSession) -> dict[str, Any]:
    """Return whether the calling IP is in dev-mode and the full whitelist."""
    ip = _client_ip(request)
    setting = await db.scalar(select(Setting).where(Setting.key == _DEV_MODE_KEY))
    dev_ips: list[str] = []
    if setting:
        try:
            dev_ips = json.loads(setting.value or "[]")
        except Exception:
            pass
    return {"current_ip": ip, "dev_mode": ip in dev_ips, "whitelisted_ips": dev_ips}


@router.post("/dev-mode/toggle")
async def toggle_dev_mode(request: Request, db: DbSession) -> dict[str, Any]:
    """Add or remove the calling IP from the dev-mode whitelist."""
    ip = _client_ip(request)
    setting = await db.scalar(select(Setting).where(Setting.key == _DEV_MODE_KEY))
    dev_ips: list[str] = []
    if setting:
        try:
            dev_ips = json.loads(setting.value or "[]")
        except Exception:
            pass

    if ip in dev_ips:
        dev_ips.remove(ip)
        enabled = False
    else:
        dev_ips.append(ip)
        enabled = True

    if setting:
        setting.value = json.dumps(dev_ips)
    else:
        db.add(Setting(key=_DEV_MODE_KEY, value=json.dumps(dev_ips), group="security", is_public=False))
    await db.commit()
    return {"current_ip": ip, "dev_mode": enabled, "whitelisted_ips": dev_ips}


@router.get("/ip-usage")
async def list_ip_usage(db: DbSession, limit: int = 100) -> list[dict[str, Any]]:
    """List recorded IP-app first-use entries."""
    rows = (
        await db.scalars(
            select(IpUsageLog).order_by(IpUsageLog.id.desc()).limit(limit)
        )
    ).all()
    return [{"id": r.id, "ip": r.ip, "app_name": r.app_name, "first_used_at": r.created_at} for r in rows]


@router.delete("/ip-usage/{entry_id}")
async def delete_ip_usage(entry_id: int, db: DbSession) -> Response:
    """Remove an IP usage entry so that IP gets a free run again."""
    entry = await db.get(IpUsageLog, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    await db.delete(entry)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
