"""Authentication endpoints: login, refresh, current user."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    EmergencyReset,
    LoginRequest,
    PasswordChange,
    ProfileUpdate,
    RefreshRequest,
    Token,
)
from app.schemas.user import CurrentUser as CurrentUserSchema

router = APIRouter(prefix="/auth", tags=["auth"])


async def _authenticate(db, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is inactive")
    user.last_login_at = datetime.now(UTC)
    await db.commit()
    return user


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db: DbSession) -> Token:
    user = await _authenticate(db, payload.email, payload.password)
    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login/form", response_model=Token, include_in_schema=False)
async def login_form(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession
) -> Token:
    """OAuth2 password flow — powers the Swagger 'Authorize' button.

    ``username`` is the email.
    """
    user = await _authenticate(db, form.username, form.password)
    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=Token)
async def refresh(payload: RefreshRequest, db: DbSession) -> Token:
    claims = decode_token(payload.refresh_token)
    if not claims or claims.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = await db.get(User, int(claims["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return Token(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=CurrentUserSchema)
async def me(user: CurrentUser) -> CurrentUserSchema:
    return CurrentUserSchema(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_superuser=user.is_superuser,
        permissions=sorted(user.permission_codes),
    )


@router.put("/me", response_model=CurrentUserSchema)
async def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DbSession):
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] and data["email"] != user.email:
        existing = await db.scalar(select(User).where(User.email == data["email"]))
        if existing and existing.id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
        user.email = data["email"]
    if "full_name" in data:
        user.full_name = data["full_name"]
    await db.commit()
    await db.refresh(user)
    return CurrentUserSchema(
        id=user.id, email=user.email, full_name=user.full_name,
        is_superuser=user.is_superuser, permissions=sorted(user.permission_codes),
    )


@router.post("/change-password")
async def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession) -> dict:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return {"ok": True, "detail": "Password updated"}


@router.post("/emergency-reset")
async def emergency_reset(payload: EmergencyReset, db: DbSession) -> dict:
    """Out-of-band credential reset validated against CUSTOM_AUTH_TOKEN.

    Lets an admin recover access without a session if the password is lost.
    """
    expected = settings.CUSTOM_AUTH_TOKEN
    if not expected:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Emergency reset is not configured (set CUSTOM_AUTH_TOKEN)",
        )
    if not secrets.compare_digest(payload.token, expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid emergency token")
    target = await db.scalar(select(User).where(User.email == payload.email))
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No user with that email")
    target.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return {"ok": True, "detail": "Password reset for " + target.email}
