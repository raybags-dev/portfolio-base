"""Audio & Podcast Stream API broker - gated by ENABLE_AUDIO_API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.deps import DbSession, require_admin, require_flag
from app.modules import ModuleSpec
from app.modules.audio_api import aws_broker, service

FLAG = "ENABLE_AUDIO_API"

router = APIRouter(
    prefix="/audio-api",
    tags=["audio-api"],
    dependencies=[Depends(require_flag(FLAG))],
)


class ConfigUpdate(BaseModel):
    region: str | None = None
    api_url: str | None = None
    tracks_table: str | None = None
    progress_table: str | None = None
    audio_bucket: str | None = None
    admin_key_param: str | None = None
    access_key_id: str | None = None
    secret_access_key: str | None = None


class UploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    content_type: str = Field(min_length=3, max_length=64)


class TrackCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    artist: str | None = None
    category: str = Field(pattern="^(podcast|music|lecture|demo)$")
    durationSeconds: int = Field(gt=0)
    s3Key: str
    summary: str | None = None
    coverUrl: str | None = None


# ── public ────────────────────────────────────────────────────────────────────


@router.get("/config")
async def get_public_config(db: DbSession) -> dict[str, Any]:
    cfg = await service.get_config(db)
    return service.public_config(cfg)


# ── admin ─────────────────────────────────────────────────────────────────────


@router.get("/admin/config", dependencies=[Depends(require_admin())])
async def admin_get_config(db: DbSession) -> dict[str, Any]:
    cfg = await service.get_config(db)
    safe = {k: ("<set>" if k == "secret_access_key" and v else v) for k, v in cfg.items()}
    return {**safe, "deployed": service.is_deployed(cfg)}


@router.put("/admin/config", dependencies=[Depends(require_admin())])
async def admin_put_config(payload: ConfigUpdate, db: DbSession) -> dict[str, Any]:
    current = await service.get_config(db)
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("secret_access_key") == "<set>":
        updates.pop("secret_access_key")
    cfg = await service.save_config(db, {**current, **updates})
    safe = {k: ("<set>" if k == "secret_access_key" and v else v) for k, v in cfg.items()}
    return {**safe, "deployed": service.is_deployed(cfg)}


@router.get("/admin/tracks", dependencies=[Depends(require_admin())])
async def admin_list_tracks(db: DbSession) -> dict[str, Any]:
    cfg = await service.get_config(db)
    if not service.is_deployed(cfg):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Audio API is not deployed yet")
    code, body = await aws_broker.proxy_public_get(cfg, "/tracks?limit=50")
    return body


@router.post("/admin/tracks", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin())])
async def admin_create_track(payload: TrackCreate, db: DbSession) -> dict[str, Any]:
    cfg = await service.get_config(db)
    if not service.is_deployed(cfg):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Audio API is not deployed yet")
    code, body = await aws_broker.proxy_admin(cfg, "POST", "/tracks", payload.model_dump(exclude_none=True))
    if code >= 300:
        raise HTTPException(code, detail=body.get("message", "Upstream error"))
    return body


@router.post("/admin/upload", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin())])
async def admin_presign_upload(
    payload: UploadRequest,
    request: Request,
    db: DbSession,
) -> dict[str, Any]:
    cfg = await service.get_config(db)
    if not service.is_deployed(cfg):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Audio API is not deployed yet")
    error = service.validate_upload(payload.filename, payload.size_bytes, payload.content_type)
    if error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)
    import uuid

    key = f"audio/{uuid.uuid4().hex[:12]}/{service.sanitize_filename(payload.filename)}"
    signed = await aws_broker.presign_put(cfg, key=key, content_type=payload.content_type)
    return {"key": key, "upload": signed, "expires_in": service.PRESIGN_TTL_SECONDS}


spec = ModuleSpec(key="audio-api", flag=FLAG, router=router, prefix="", tags=["audio-api"])
