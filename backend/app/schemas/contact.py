"""Contact form schemas (public submit + admin read)."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr

from app.schemas.common import TimestampedRead


class ContactChallenge(BaseModel):
    """A lightweight 'I'm not a robot' math challenge."""

    token: str
    question: str


class ContactSubmit(BaseModel):
    name: str
    email: EmailStr
    subject: str | None = None
    message: str
    # anti-bot
    challenge_token: str
    challenge_answer: int
    website: str | None = None  # honeypot: must stay empty


class ContactMessageRead(TimestampedRead):
    name: str
    email: EmailStr
    subject: str | None = None
    message: str
    is_read: bool
    delivered: bool
