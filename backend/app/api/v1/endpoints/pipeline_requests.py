"""Public endpoint for DataForge pipeline run requests.

Visitors submit their name/email and reason; the request is stored as a
ContactMessage and the admin is notified via Discord webhook (with SMTP
fallback if configured).

Admin endpoints allow issuing a time-limited access token directly to the
requester's email, or sending a polite rejection.
"""

from __future__ import annotations

import asyncio
import secrets
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbSession, require_admin
from app.core.logging import get_logger
from app.models.content import SiteConfiguration
from app.models.platform import AppToken, ContactMessage, IpUsageLog

log = get_logger("pipeline_requests")
router = APIRouter(prefix="/pipeline-requests", tags=["pipeline-requests"])

_SUBJECT = "DataForge Pipeline Run Request"
_TOKEN_TTL_HOURS = 48
_APP_NAME = "dataforge-elt"


# ── Schemas ───────────────────────────────────────────────────────────────────

class PipelineRequestIn(BaseModel):
    name: str
    email: EmailStr
    reason: str | None = None


class CheckAccessIn(BaseModel):
    token: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _notify_discord(payload: PipelineRequestIn) -> bool:
    if not settings.DISCORD_WEBHOOK:
        return False
    body = {
        "embeds": [
            {
                "title": "New DataForge Pipeline Request",
                "color": 0x6366F1,
                "fields": [
                    {"name": "Name", "value": payload.name, "inline": True},
                    {"name": "Email", "value": payload.email, "inline": True},
                    {"name": "Reason", "value": payload.reason or "—", "inline": False},
                ],
                "footer": {"text": "raybags.com/dataforge"},
            }
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(settings.DISCORD_WEBHOOK, json=body)
            return r.status_code < 300
    except Exception as exc:
        log.warning("pipeline_request.discord.failed", error=str(exc))
        return False


def _make_email(to_addr: str, reply_to: str, subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER or "noreply@raybags.com"
    msg["To"] = to_addr
    msg["Reply-To"] = reply_to
    msg.set_content(body)
    return msg


def _send_sync(email: EmailMessage) -> None:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as srv:
        if settings.SMTP_TLS:
            srv.starttls()
        if settings.SMTP_USER:
            srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        srv.send_message(email)


async def _try_send(email: EmailMessage) -> bool:
    if not settings.SMTP_HOST:
        return False
    try:
        await asyncio.to_thread(_send_sync, email)
        return True
    except Exception as exc:
        log.warning("pipeline_request.email.failed", error=str(exc))
        return False


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (request.client and request.client.host) or "unknown"


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_pipeline_request(
    payload: PipelineRequestIn,
    request: Request,
    db: DbSession,
) -> dict:
    discord_ok, email_ok = await asyncio.gather(
        _notify_discord(payload),
        _deliver_to_admin(db, payload),
    )

    msg = ContactMessage(
        name=payload.name,
        email=payload.email,
        subject=_SUBJECT,
        message=payload.reason or "",
        ip_address=request.client.host if request.client else None,
        delivered=discord_ok or email_ok,
    )
    db.add(msg)
    await db.commit()

    return {
        "ok": True,
        "detail": "Request received. The admin will review and send you a token.",
    }


async def _deliver_to_admin(db: DbSession, payload: PipelineRequestIn) -> bool:
    if not settings.SMTP_HOST:
        return False
    site = await db.get(SiteConfiguration, 1)
    to_addr = (
        site.contact_email if site and site.contact_email else settings.CONTACT_RECIPIENT
    )
    email = _make_email(
        to_addr=to_addr,
        reply_to=payload.email,
        subject=f"[DataForge] {_SUBJECT}",
        body=f"From: {payload.name} <{payload.email}>\n\nReason:\n{payload.reason or '—'}",
    )
    return await _try_send(email)


@router.post("/check-access")
async def check_access(
    payload: CheckAccessIn,
    request: Request,
    db: DbSession,
) -> dict:
    """Public gateway: first run free per IP, then token required."""
    ip = _client_ip(request)

    usage = await db.scalar(
        select(IpUsageLog).where(
            IpUsageLog.ip == ip,
            IpUsageLog.app_name == _APP_NAME,
        )
    )

    if usage is None:
        db.add(IpUsageLog(ip=ip, app_name=_APP_NAME))
        await db.commit()
        return {"allowed": True, "first_run": True}

    if not payload.token:
        return {"allowed": False, "reason": "rate_limited"}

    now = datetime.now(UTC)
    tok = await db.scalar(
        select(AppToken).where(
            AppToken.token == payload.token,
            AppToken.is_used.is_(False),
            AppToken.expires_at > now,
        )
    )
    if tok is None:
        return {"allowed": False, "reason": "invalid_token"}

    tok.is_used = True
    tok.used_by_ip = ip
    tok.used_at = now
    await db.commit()
    return {"allowed": True}


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.post("/{msg_id}/issue-token", dependencies=[Depends(require_admin())])
async def issue_token(msg_id: int, db: DbSession) -> dict:
    """Generate a 48-hour access token and email it to the requester."""
    msg = await db.get(ContactMessage, msg_id)
    if not msg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if msg.subject != _SUBJECT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a pipeline request")

    now = datetime.now(UTC)
    tok = AppToken(
        token=secrets.token_urlsafe(48),
        expires_at=now + timedelta(hours=_TOKEN_TTL_HOURS),
    )
    db.add(tok)

    msg.is_read = True
    await db.commit()
    await db.refresh(tok)

    email = _make_email(
        to_addr=msg.email,
        reply_to=settings.CONTACT_RECIPIENT,
        subject="Your DataForge access token",
        body=(
            f"Hi {msg.name},\n\n"
            "Your DataForge pipeline access token is ready:\n\n"
            f"  {tok.token}\n\n"
            f"It expires in {_TOKEN_TTL_HOURS} hours. To use it, visit:\n"
            "  https://raybags.com/dataforge/\n\n"
            "Click 'Run Pipeline', enter the token when prompted, and you're set.\n\n"
            "— Ray"
        ),
    )
    delivered = await _try_send(email)

    return {
        "ok": True,
        "token": tok.token,
        "expires_at": tok.expires_at.isoformat(),
        "delivered": delivered,
    }


@router.post("/{msg_id}/reject", dependencies=[Depends(require_admin())])
async def reject_request(msg_id: int, db: DbSession) -> dict:
    """Send a polite rejection email and mark the message as read."""
    msg = await db.get(ContactMessage, msg_id)
    if not msg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if msg.subject != _SUBJECT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a pipeline request")

    msg.is_read = True
    await db.commit()

    email = _make_email(
        to_addr=msg.email,
        reply_to=settings.CONTACT_RECIPIENT,
        subject="Re: DataForge pipeline access",
        body=(
            f"Hi {msg.name},\n\n"
            "Thanks for your interest in DataForge. Unfortunately I'm not able to "
            "accommodate this request at the moment.\n\n"
            "Feel free to explore the dashboard at https://raybags.com/dataforge/ "
            "and reach out again any time.\n\n"
            "— Ray"
        ),
    )
    delivered = await _try_send(email)

    return {"ok": True, "delivered": delivered}
