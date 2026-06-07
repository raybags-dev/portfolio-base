"""FastAPI dependencies: current user, RBAC guards, feature-flag guards."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    token: Annotated[str | None, Depends(oauth2_scheme)] = None,
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = decode_token(token)
    if not claims or claims.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    user = await db.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    db: DbSession,
    token: Annotated[str | None, Depends(oauth2_scheme)] = None,
) -> User | None:
    if not token:
        return None
    claims = decode_token(token)
    if not claims or claims.get("type") != "access":
        return None
    return await db.get(User, int(claims["sub"]))


def require_permissions(*codes: str) -> Callable:
    """Dependency factory enforcing that the user has all given permission codes.

    Superusers bypass the check.
    """

    async def _checker(user: CurrentUser) -> User:
        if user.is_superuser:
            return user
        missing = set(codes) - user.permission_codes
        if missing:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {', '.join(sorted(missing))}",
            )
        return user

    return _checker


def require_admin() -> Callable:
    async def _checker(user: CurrentUser) -> User:
        if not user.is_superuser and "admin" not in {r.name for r in user.roles}:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
        return user

    return _checker


def require_flag(key: str, default: bool = False) -> Callable:
    """Dependency factory gating an endpoint behind a feature flag.

    Module routers are always mounted (routes can't be added at runtime), but a
    route guarded by this returns 404 while its flag is off — so a disabled
    module is invisible until an admin enables it in the panel. No redeploy.
    """

    async def _checker(db: DbSession) -> None:
        from app.services.feature_flags import flags  # local import avoids cycle

        if not await flags.is_enabled(db, key, default):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail=f"Module '{key}' is not enabled",
            )

    return _checker
