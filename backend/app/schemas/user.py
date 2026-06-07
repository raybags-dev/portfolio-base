"""User & RBAC schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.schemas.common import ORMModel, TimestampedRead


class PermissionRead(TimestampedRead):
    code: str
    description: str | None = None


class RoleRead(TimestampedRead):
    name: str
    description: str | None = None
    permissions: list[PermissionRead] = []


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    is_active: bool = True
    avatar_url: str | None = None


class UserCreate(UserBase):
    password: str
    role_names: list[str] = []
    is_superuser: bool = False


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    avatar_url: str | None = None
    password: str | None = None
    role_names: list[str] | None = None


class UserRead(TimestampedRead):
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    is_superuser: bool
    avatar_url: str | None = None
    last_login_at: datetime | None = None
    roles: list[RoleRead] = []


class CurrentUser(ORMModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    is_superuser: bool
    permissions: list[str] = []
