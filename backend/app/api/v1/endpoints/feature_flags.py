"""Feature-flag endpoints — the runtime control layer."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbSession, require_admin
from app.models.platform import FeatureFlag
from app.schemas.platform import (
    FeatureFlagCreate,
    FeatureFlagRead,
    FeatureFlagUpdate,
)
from app.services.feature_flags import flags

router = APIRouter(prefix="/feature-flags", tags=["feature-flags"])


@router.get("/public", response_model=dict[str, bool])
async def public_flags(db: DbSession) -> dict[str, bool]:
    """Map of flag key -> enabled. Lets the frontend show/hide modules."""
    return await flags.all_enabled(db)


@router.get("", response_model=list[FeatureFlagRead], dependencies=[Depends(require_admin())])
async def list_flags(db: DbSession):
    return (await db.scalars(select(FeatureFlag).order_by(FeatureFlag.group, FeatureFlag.key))).all()


@router.post(
    "",
    response_model=FeatureFlagRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin())],
)
async def create_flag(payload: FeatureFlagCreate, db: DbSession):
    if await db.scalar(select(FeatureFlag).where(FeatureFlag.key == payload.key)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Flag key already exists")
    flag = FeatureFlag(**payload.model_dump())
    db.add(flag)
    await db.commit()
    await db.refresh(flag)
    return flag


@router.put(
    "/{key}",
    response_model=FeatureFlagRead,
    dependencies=[Depends(require_admin())],
)
async def update_flag(key: str, payload: FeatureFlagUpdate, db: DbSession):
    flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.key == key))
    if not flag:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(flag, field, value)
    await db.commit()
    await db.refresh(flag)
    return flag


@router.post(
    "/{key}/toggle",
    response_model=FeatureFlagRead,
    dependencies=[Depends(require_admin())],
)
async def toggle_flag(key: str, db: DbSession):
    flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.key == key))
    if not flag:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found")
    flag.enabled = not flag.enabled
    await db.commit()
    await db.refresh(flag)
    return flag
