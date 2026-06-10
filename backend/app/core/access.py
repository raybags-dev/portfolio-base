"""Per-IP app access control — first run is free, second requires a token.

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


def require_app_access(app_name: str):
    """Factory returning a FastAPI dependency that enforces IP-based rate limiting."""

    async def _check(
        request: Request,
        db: DbSession,
        x_app_token: str | None = Header(None, alias="X-App-Token"),
    ) -> None:
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

        # --- first-use check ---
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

        # --- token required for repeat runs ---
        if not x_app_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="rate_limited",
            )

        now = datetime.now(UTC)
        token = await db.scalar(
            select(AppToken).where(
                AppToken.token == x_app_token,
                AppToken.is_used.is_(False),
                AppToken.expires_at > now,
            )
        )
        if token is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="invalid_token",
            )

        token.is_used = True
        token.used_by_ip = ip
        token.used_at = now
        await db.commit()

    return Depends(_check)
