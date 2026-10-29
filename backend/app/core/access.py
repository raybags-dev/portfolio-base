"""Per-IP app access control - first run is free, second requires a token.

Usage:
    @router.post("/sessions/{id}/run", dependencies=[Depends(require_app_access("hotel-reviews"))])

Dev mode (admin-only): add the admin's IP to the "dev_mode_ips" Setting to
bypass the check entirely on that machine.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select

from app.core.deps import DbSession
from app.models.content import Setting
from app.models.platform import AppToken, IpUsageLog

_DEV_MODE_KEY = "dev_mode_ips"


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (request.client and request.client.host) or "unknown"


async def redeem_token(
    db: DbSession,
    token_str: str,
    app_name: str,
    ip: str | None = None,
) -> AppToken | None:
    """Consume one use of an access token for ``app_name``.

    Returns the token on success, ``None`` when the token is unknown,
    expired, exhausted, or scoped to a different app. Legacy tokens
    (``app_name`` NULL) are accepted by every app.
    """
    now = datetime.now(UTC)
    token = await db.scalar(
        select(AppToken).where(
            AppToken.token == token_str,
            AppToken.expires_at > now,
        )
    )
    if token is None:
        return None
    if token.is_used or token.uses >= token.max_uses:
        return None
    if token.app_name is not None and token.app_name != app_name:
        return None

    token.uses += 1
    token.used_by_ip = ip
    token.used_at = now
    if token.uses >= token.max_uses:
        token.is_used = True
    await db.commit()
    return token


async def check_app_access(
    db: DbSession,
    request: Request,
    app_name: str,
    x_app_token: str | None,
    *,
    allow_free_run: bool = True,
) -> None:
    """Core IP/token gate: first run free per IP, then an app-scoped token.

    Callable directly from endpoints that must run payload validation BEFORE
    burning a token use (e.g. upload brokers); ``require_app_access`` wraps
    this for the common dependency-injection case.

    ``allow_free_run=False`` disables the anonymous first run - use for apps
    whose every interaction costs money (e.g. MediaConvert transcodes), where
    only admin-issued keys may unlock usage.
    """
    ip = _client_ip(request)

    # --- dev mode whitelist ---
    setting = await db.scalar(select(Setting).where(Setting.key == _DEV_MODE_KEY))
    if setting:
        try:
            dev_ips: list[str] = json.loads(setting.value or "[]")
            if ip in dev_ips:
                return
        except Exception:
            pass

    # --- first-use check (skipped for token-only apps) ---
    if allow_free_run:
        usage = await db.scalar(
            select(IpUsageLog).where(
                IpUsageLog.ip == ip,
                IpUsageLog.app_name == app_name,
            )
        )
        if usage is None:
            db.add(IpUsageLog(ip=ip, app_name=app_name))
            await db.commit()
            return

    # --- token required ---
    if not x_app_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="rate_limited",
        )

    token = await redeem_token(db, x_app_token, app_name, ip)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="invalid_token",
        )


def require_app_access(app_name: str, *, allow_free_run: bool = True):
    """Factory returning a FastAPI dependency that enforces IP-based rate limiting."""

    async def _check(
        request: Request,
        db: DbSession,
        x_app_token: str | None = Header(None, alias="X-App-Token"),
    ) -> None:
        await check_app_access(
            db, request, app_name, x_app_token, allow_free_run=allow_free_run
        )

    return Depends(_check)
