"""Public contact form: math captcha + honeypot, store message, optional email.

The 'I'm not a robot' check is self-contained (no external service / keys): we
issue a short-lived signed math challenge and verify the answer on submit, plus
a hidden honeypot field. If SMTP is configured the message is also emailed to
the site's contact address; either way it's stored for the admin to read.
"""

from __future__ import annotations

import asyncio
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbSession, require_admin
from app.core.logging import get_logger
from app.models.content import SiteConfiguration
from app.models.platform import ContactMessage
from app.schemas.contact import (
    ContactChallenge,
    ContactMessageRead,
    ContactSubmit,
)

log = get_logger("contact")
router = APIRouter(prefix="/contact", tags=["contact"])

_CAPTCHA_TYPE = "captcha"


def _make_challenge() -> ContactChallenge:
    # Deterministic-but-varied small numbers without Math.random/global state:
    # derive from current microsecond. Good enough for a bot speed bump.
    now = datetime.now(UTC)
    a = (now.microsecond % 9) + 1
    b = (now.second % 9) + 1
    token = jwt.encode(
        {"type": _CAPTCHA_TYPE, "ans": a + b,
         "exp": now + timedelta(minutes=10)},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM,
    )
    return ContactChallenge(token=token, question=f"What is {a} + {b}?")


def _verify_challenge(token: str, answer: int) -> bool:
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return False
    return claims.get("type") == _CAPTCHA_TYPE and int(claims.get("ans", -1)) == int(answer)


def _send_email_sync(to_addr: str, msg: ContactSubmit) -> None:
    email = EmailMessage()
    email["Subject"] = f"[Portfolio contact] {msg.subject or 'New message'}"
    email["From"] = settings.SMTP_FROM or settings.SMTP_USER or "noreply@raybags.com"
    email["To"] = to_addr
    email["Reply-To"] = msg.email
    email.set_content(
        f"From: {msg.name} <{msg.email}>\n\n{msg.message}"
    )
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        if settings.SMTP_TLS:
            server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
        server.send_message(email)


async def _try_send_email(db: DbSession, payload: ContactSubmit) -> bool:
    if not settings.SMTP_HOST:
        return False
    site = await db.get(SiteConfiguration, 1)
    to_addr = (site.contact_email if site and site.contact_email
               else settings.CONTACT_RECIPIENT)
    try:
        await asyncio.to_thread(_send_email_sync, to_addr, payload)
        return True
    except Exception as exc:  # delivery failed — message is still stored
        log.warning("contact.email.failed", error=str(exc))
        return False


@router.get("/challenge", response_model=ContactChallenge)
async def challenge() -> ContactChallenge:
    return _make_challenge()


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit(payload: ContactSubmit, request: Request, db: DbSession) -> dict:
    # honeypot: real users never fill this hidden field
    if payload.website:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Spam detected")
    if not _verify_challenge(payload.challenge_token, payload.challenge_answer):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Verification failed — please try the challenge again")

    delivered = await _try_send_email(db, payload)
    msg = ContactMessage(
        name=payload.name, email=payload.email, subject=payload.subject,
        message=payload.message,
        ip_address=request.client.host if request.client else None,
        delivered=delivered,
    )
    db.add(msg)
    await db.commit()
    return {"ok": True, "delivered": delivered,
            "detail": "Message sent." if delivered else "Message received."}


# ---- admin: read inbox ----
@router.get("/messages", response_model=list[ContactMessageRead],
            dependencies=[Depends(require_admin())])
async def list_messages(db: DbSession):
    return (await db.scalars(
        select(ContactMessage).order_by(ContactMessage.id.desc())
    )).all()


@router.post("/messages/{msg_id}/read", dependencies=[Depends(require_admin())])
async def mark_read(msg_id: int, db: DbSession) -> dict:
    msg = await db.get(ContactMessage, msg_id)
    if not msg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    msg.is_read = True
    await db.commit()
    return {"ok": True}
