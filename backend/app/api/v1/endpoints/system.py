"""System endpoints: health, readiness, version, settings."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, select, text

from app import __version__
from app.core.config import settings as app_settings
from app.core.deps import DbSession, require_admin
from app.models.content import Setting
from app.models.user import ActivityLog, AuditLog
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


# ---- live log viewer ----
@router.get("/logs", dependencies=[Depends(require_admin())])
async def get_logs(limit: int = 200, level: str | None = None) -> list[dict]:
    """Return recent in-memory log entries (admin only). Logs reset on restart."""
    from app.core.logging import log_buffer

    return log_buffer.recent(limit=min(limit, 500), level=level)


# ---- persisted activity logs ----
class ActivityLogRead(BaseModel):
    id: int
    created_at: datetime
    category: str
    message: str
    level: str
    context: dict | None

    model_config = {"from_attributes": True}


class AuditLogRead(BaseModel):
    id: int
    created_at: datetime
    actor_id: int | None
    action: str
    entity: str | None
    entity_id: str | None
    detail: dict | None
    ip_address: str | None

    model_config = {"from_attributes": True}


@router.get(
    "/activity-logs",
    response_model=list[ActivityLogRead],
    dependencies=[Depends(require_admin())],
)
async def get_activity_logs(
    db: DbSession,
    limit: int = Query(default=200, le=500),
    level: str | None = None,
    category: str | None = None,
) -> list[ActivityLog]:
    q = select(ActivityLog).order_by(desc(ActivityLog.created_at)).limit(limit)
    if level:
        q = q.where(ActivityLog.level == level)
    if category:
        q = q.where(ActivityLog.category == category)
    return list(await db.scalars(q))


@router.get(
    "/audit-logs",
    response_model=list[AuditLogRead],
    dependencies=[Depends(require_admin())],
)
async def get_audit_logs(
    db: DbSession,
    limit: int = Query(default=200, le=500),
    action: str | None = None,
    entity: str | None = None,
) -> list[AuditLog]:
    q = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)
    if action:
        q = q.where(AuditLog.action.ilike(f"%{action}%"))
    if entity:
        q = q.where(AuditLog.entity == entity)
    return list(await db.scalars(q))
