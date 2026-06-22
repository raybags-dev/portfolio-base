"""Public endpoint for DataForge pipeline run requests.

Visitors submit their name/email and reason; the request is stored as a
ContactMessage and the admin is notified via Discord webhook (with SMTP
fallback if configured).
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

import httpx
from fastapi import APIRouter, Request, status
from pydantic import BaseModel, EmailStr

from app.core.config import settings
from app.core.deps import DbSession
from app.core.logging import get_logger
from app.models.content import SiteConfiguration
from app.models.platform import ContactMessage

log = get_logger("pipeline_requests")
router = APIRouter(prefix="/pipeline-requests", tags=["pipeline-requests"])

_SUBJECT = "DataForge Pipeline Run Request"


class PipelineRequestIn(BaseModel):
    name: str
    email: EmailStr
    reason: str | None = None


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


def _send_email_sync(to_addr: str, payload: PipelineRequestIn) -> None:
    email = EmailMessage()
    email["Subject"] = f"[DataForge] {_SUBJECT}"
    email["From"] = settings.SMTP_FROM or settings.SMTP_USER or "noreply@raybags.com"
    email["To"] = to_addr
    email["Reply-To"] = payload.email
    email.set_content(
        f"From: {payload.name} <{payload.email}>\n\nReason:\n{payload.reason or '—'}"
    )
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        if settings.SMTP_TLS:
            server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        server.send_message(email)


async def _try_send_email(db: DbSession, payload: PipelineRequestIn) -> bool:
    if not settings.SMTP_HOST:
        return False
    site = await db.get(SiteConfiguration, 1)
    to_addr = (
        site.contact_email if site and site.contact_email else settings.CONTACT_RECIPIENT
    )
    try:
        await asyncio.to_thread(_send_email_sync, to_addr, payload)
        return True
    except Exception as exc:
        log.warning("pipeline_request.email.failed", error=str(exc))
        return False


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_pipeline_request(
    payload: PipelineRequestIn,
    request: Request,
    db: DbSession,
) -> dict:
    discord_ok, email_ok = await asyncio.gather(
        _notify_discord(payload),
        _try_send_email(db, payload),
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
