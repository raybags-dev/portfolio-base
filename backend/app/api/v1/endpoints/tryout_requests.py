"""Public tryout-access requests for the AWS-backed portfolio apps.

Flow: a visitor requests a 24h tryout pass for an app (name/email/reason);
the request is stored as a ContactMessage and the admin is notified via
Discord + email (Resend). The admin issues an app-scoped, quota-limited
AppToken (24h TTL) which is emailed to the requester; the requester pastes
it into the app's page to unlock the tryout.

This generalises the DataForge-specific flow in ``pipeline_requests.py``,
which stays untouched for backward compatibility.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.core.access import _client_ip, redeem_token
from app.core.config import settings
from app.core.deps import DbSession, require_admin
from app.core.email import send_email
from app.core.logging import get_logger
from app.models.platform import AppToken, ContactMessage, IpUsageLog

log = get_logger("tryout_requests")
router = APIRouter(prefix="/tryout-requests", tags=["tryout-requests"])

_TOKEN_TTL_HOURS = 24
_SUBJECT_PREFIX = "Tryout: "

# Registry of apps that accept tryout requests. max_uses is the per-token
# quota - the primary expense guardrail for the AWS-backed apps.
TRYOUT_APPS: dict[str, dict[str, Any]] = {
    "vod-pipeline": {
        "label": "VOD & HLS Packaging Pipeline",
        "page": "/vod-pipeline",
        "max_uses": 2,  # 2 transcodes (MediaConvert minutes cost real money)
    },
    "audio-api": {
        "label": "Audio & Podcast Stream API",
        "page": "/audio-api",
        "max_uses": 50,  # reads are near-zero cost; generous quota
    },
    "telemetry-collector": {
        "label": "Live Stream Telemetry Collector",
        "page": "/telemetry-collector",
        "max_uses": 5,  # 5 load-test bursts
    },
}


# ── Schemas ───────────────────────────────────────────────────────────────────


class TryoutRequestIn(BaseModel):
    app_key: str
    name: str
    email: EmailStr
    reason: str | None = None


class TryoutCheckIn(BaseModel):
    app_key: str
    token: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _subject(app_key: str) -> str:
    return f"{_SUBJECT_PREFIX}{app_key}"


def _app_from_subject(subject: str) -> str | None:
    if not subject.startswith(_SUBJECT_PREFIX):
        return None
    app_key = subject[len(_SUBJECT_PREFIX):].strip()
    return app_key if app_key in TRYOUT_APPS else None


async def _notify_discord(payload: TryoutRequestIn, app_label: str) -> bool:
    if not settings.DISCORD_WEBHOOK:
        return False
    body = {
        "embeds": [
            {
                "title": f"Tryout request: {app_label}",
                "color": 0x10B981,
                "fields": [
                    {"name": "Name", "value": payload.name, "inline": True},
                    {"name": "Email", "value": payload.email, "inline": True},
                    {"name": "Reason", "value": payload.reason or "-", "inline": False},
                ],
                "footer": {"text": "raybags.com admin -> Messages"},
            }
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(settings.DISCORD_WEBHOOK, json=body)
            return r.status_code < 300
    except Exception as exc:
        log.warning("tryout.discord.failed", error=str(exc))
        return False


# ── Public endpoints ──────────────────────────────────────────────────────────


@router.get("/apps")
async def list_tryout_apps() -> list[dict[str, Any]]:
    """List the apps that accept tryout requests (drives the frontend; no hardcoding)."""
    return [
        {"key": key, "label": cfg["label"], "page": cfg["page"], "max_uses": cfg["max_uses"]}
        for key, cfg in TRYOUT_APPS.items()
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_tryout_request(
    payload: TryoutRequestIn,
    request: Request,
    db: DbSession,
) -> dict:
    app = TRYOUT_APPS.get(payload.app_key)
    if app is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown app_key")

    discord_ok = await _notify_discord(payload, str(app["label"]))
    email_ok = await send_email(
        to=settings.CONTACT_RECIPIENT,
        subject=f"[Tryout] {app['label']} - {payload.name}",
        text=(
            f"New tryout request for {app['label']} ({payload.app_key})\n\n"
            f"Name: {payload.name}\n"
            f"Email: {payload.email}\n\n"
            f"Reason:\n{payload.reason or '-'}\n\n"
            "Issue a token from the admin panel -> Messages."
        ),
        reply_to=payload.email,
    )

    msg = ContactMessage(
        name=payload.name,
        email=payload.email,
        subject=_subject(payload.app_key),
        message=payload.reason or "",
        ip_address=request.client.host if request.client else None,
        delivered=discord_ok or email_ok,
    )
    db.add(msg)
    await db.commit()

    return {
        "ok": True,
        "detail": "Request received. The admin will review and email you a 24h tryout token.",
    }


@router.post("/check-access")
async def check_tryout_access(
    payload: TryoutCheckIn,
    request: Request,
    db: DbSession,
) -> dict:
    """Public gateway: first run free per IP, then a valid app-scoped token is required."""
    app = TRYOUT_APPS.get(payload.app_key)
    if app is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown app_key")

    ip = _client_ip(request)
    usage = await db.scalar(
        select(IpUsageLog).where(
            IpUsageLog.ip == ip,
            IpUsageLog.app_name == payload.app_key,
        )
    )
    if usage is None:
        db.add(IpUsageLog(ip=ip, app_name=payload.app_key))
        await db.commit()
        return {"allowed": True, "first_run": True}

    if not payload.token:
        return {"allowed": False, "reason": "rate_limited"}

    token = await redeem_token(db, payload.token, payload.app_key, ip)
    if token is None:
        return {"allowed": False, "reason": "invalid_token"}
    return {"allowed": True, "uses_left": token.max_uses - token.uses}


# ── Admin endpoints ───────────────────────────────────────────────────────────


@router.post("/{msg_id}/issue-token", dependencies=[Depends(require_admin())])
async def issue_tryout_token(msg_id: int, db: DbSession) -> dict:
    """Issue a 24h app-scoped tryout pass and email it to the requester."""
    msg = await db.get(ContactMessage, msg_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    app_key = _app_from_subject(msg.subject)
    if app_key is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a tryout request")
    app = TRYOUT_APPS[app_key]

    now = datetime.now(UTC)
    tok = AppToken(
        token=secrets.token_urlsafe(48),
        expires_at=now + timedelta(hours=_TOKEN_TTL_HOURS),
        app_name=app_key,
        max_uses=int(app["max_uses"]),
    )
    db.add(tok)
    msg.is_read = True
    await db.commit()
    await db.refresh(tok)

    delivered = await send_email(
        to=msg.email,
        subject=f"Your {app['label']} tryout token (24h)",
        text=(
            f"Hi {msg.name},\n\n"
            f"Your 24-hour tryout pass for {app['label']} is ready:\n\n"
            f"  {tok.token}\n\n"
            f"It expires in {_TOKEN_TTL_HOURS} hours and allows up to "
            f"{app['max_uses']} runs. To use it, visit:\n"
            f"  https://raybags.com{app['page']}\n\n"
            "Enter the token when prompted and you're set.\n\n"
            "- Ray"
        ),
        reply_to=settings.CONTACT_RECIPIENT,
    )

    return {
        "ok": True,
        "token": tok.token,
        "app_name": tok.app_name,
        "max_uses": tok.max_uses,
        "expires_at": tok.expires_at.isoformat(),
        "delivered": delivered,
    }


@router.post("/{msg_id}/reject", dependencies=[Depends(require_admin())])
async def reject_tryout_request(msg_id: int, db: DbSession) -> dict:
    """Send a polite rejection email and mark the request as read."""
    msg = await db.get(ContactMessage, msg_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    app_key = _app_from_subject(msg.subject)
    if app_key is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a tryout request")
    app = TRYOUT_APPS[app_key]

    msg.is_read = True
    await db.commit()

    delivered = await send_email(
        to=msg.email,
        subject=f"Re: {app['label']} tryout access",
        text=(
            f"Hi {msg.name},\n\n"
            f"Thanks for your interest in {app['label']}. Unfortunately I'm not "
            "able to accommodate this request at the moment.\n\n"
            f"Feel free to explore the demo at https://raybags.com{app['page']} "
            "and reach out again any time.\n\n"
            "- Ray"
        ),
        reply_to=settings.CONTACT_RECIPIENT,
    )

    return {"ok": True, "delivered": delivered}
