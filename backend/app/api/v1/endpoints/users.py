"""Admin user management (RBAC-protected)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbSession, require_admin
from app.core.security import hash_password
from app.models.user import Role, User
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter(
    prefix="/users", tags=["users"], dependencies=[Depends(require_admin())]
)


async def _resolve_roles(db, role_names: list[str]) -> list[Role]:
    if not role_names:
        return []
    roles = (await db.scalars(select(Role).where(Role.name.in_(role_names)))).all()
    return list(roles)


@router.get("", response_model=list[UserRead])
async def list_users(db: DbSession):
    return (await db.scalars(select(User).order_by(User.id))).all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: DbSession):
    if await db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
        avatar_url=payload.avatar_url,
        hashed_password=hash_password(payload.password),
    )
    user.roles = await _resolve_roles(db, payload.role_names)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: int, db: DbSession):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(user_id: int, payload: UserUpdate, db: DbSession):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        user.hashed_password = hash_password(data.pop("password"))
    else:
        data.pop("password", None)
    if "role_names" in data:
        user.roles = await _resolve_roles(db, data.pop("role_names") or [])
    for field, value in data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: DbSession):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await db.delete(user)
    await db.commit()
