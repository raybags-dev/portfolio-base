"""System endpoints: health, readiness, version, settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text

from app import __version__
from app.core.config import settings as app_settings
from app.core.deps import DbSession, require_admin
from app.models.content import Setting
from app.schemas.content import SettingRead, SettingUpsert

router = APIRouter(tags=["system"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": app_settings.PROJECT_NAME, "version": __version__}


@router.get("/ready")
async def ready(db: DbSession) -> dict[str, str]:
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"Database not ready: {exc}"
        ) from exc
    return {"status": "ready", "environment": app_settings.ENVIRONMENT}


# ---- generic settings store ----
settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("/public", response_model=list[SettingRead])
async def public_settings(db: DbSession):
    return (await db.scalars(select(Setting).where(Setting.is_public.is_(True)))).all()


@settings_router.get(
    "", response_model=list[SettingRead], dependencies=[Depends(require_admin())]
)
async def list_settings(db: DbSession):
    return (await db.scalars(select(Setting).order_by(Setting.group, Setting.key))).all()


@settings_router.put(
    "", response_model=SettingRead, dependencies=[Depends(require_admin())]
)
async def upsert_setting(payload: SettingUpsert, db: DbSession):
    obj = await db.scalar(select(Setting).where(Setting.key == payload.key))
    if obj is None:
        obj = Setting(**payload.model_dump())
        db.add(obj)
    else:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj
