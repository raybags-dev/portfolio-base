"""Outbound transactional email: Resend API first, SMTP fallback, no-op otherwise.

Resend is the preferred provider (set ``RESEND_API_KEY``). When it is not
configured but SMTP is, the previous stdlib-SMTP path is used. When neither
is configured every send is a clean no-op returning ``False`` so callers can
fall back to manual delivery (e.g. copy the token from the admin panel).

Secrets always come from ``app.core.config.settings`` (env-driven) - never
hardcode credentials here.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

import httpx

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("core.email")

_RESEND_API_URL = "https://api.resend.com/emails"


def email_configured() -> bool:
    """Whether any outbound email provider is configured."""
    return bool(settings.RESEND_API_KEY or settings.SMTP_HOST)


async def send_email(
    *,
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
    reply_to: str | None = None,
) -> bool:
    """Send a transactional email. Returns True when the provider accepted it."""
    if settings.RESEND_API_KEY:
        return await _send_resend(to=to, subject=subject, text=text, html=html, reply_to=reply_to)
    if settings.SMTP_HOST:
        return await _send_smtp(to=to, subject=subject, text=text, html=html, reply_to=reply_to)
    log.info("email.skipped", reason="no provider configured", to=to, subject=subject)
    return False


# ── Resend ────────────────────────────────────────────────────────────────────


async def _send_resend(
    *,
    to: str,
    subject: str,
    text: str,
    html: str | None,
    reply_to: str | None,
) -> bool:
    payload: dict[str, object] = {
        "from": settings.RESEND_FROM,
        "to": [to],
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    if reply_to:
        payload["reply_to"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _RESEND_API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            )
        if resp.status_code < 300:
            log.info("email.sent", provider="resend", to=to, subject=subject)
            return True
        log.warning(
            "email.failed",
            provider="resend",
            to=to,
            subject=subject,
            status=resp.status_code,
            body=resp.text[:300],
        )
        return False
    except Exception as exc:
        log.warning("email.failed", provider="resend", to=to, subject=subject, error=str(exc))
        return False


# ── SMTP fallback ─────────────────────────────────────────────────────────────


def _build_smtp_message(*, to: str, subject: str, text: str, reply_to: str | None) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER or "noreply@raybags.com"
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(text)
    return msg


def _send_smtp_sync(msg: EmailMessage) -> None:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as srv:
        if settings.SMTP_TLS:
            srv.starttls()
        if settings.SMTP_USER:
            srv.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        srv.send_message(msg)


async def _send_smtp(
    *,
    to: str,
    subject: str,
    text: str,
    html: str | None,
    reply_to: str | None,
) -> bool:
    try:
        msg = _build_smtp_message(to=to, subject=subject, text=text, reply_to=reply_to)
        if html:
            msg.add_alternative(html, subtype="html")
        await asyncio.to_thread(_send_smtp_sync, msg)
        log.info("email.sent", provider="smtp", to=to, subject=subject)
        return True
    except Exception as exc:
        log.warning("email.failed", provider="smtp", to=to, subject=subject, error=str(exc))
        return False
