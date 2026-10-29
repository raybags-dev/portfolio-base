"""VOD & HLS Packaging Pipeline API - gated by ENABLE_VOD_PIPELINE."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.access import _client_ip, check_app_access
from app.core.deps import DbSession, require_admin, require_flag
from app.models.platform import VodJob
from app.modules import ModuleSpec
from app.modules.vod_pipeline import service

FLAG = "ENABLE_VOD_PIPELINE"

router = APIRouter(
    prefix="/vod-pipeline",
    tags=["vod-pipeline"],
    dependencies=[Depends(require_flag(FLAG))],
)


class UploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    content_type: str = Field(min_length=3, max_length=64)


class ConfigUpdate(BaseModel):
    region: str | None = None
    raw_bucket: str | None = None
    processed_bucket: str | None = None
    jobs_table: str | None = None
    cloudfront_domain: str | None = None
    access_key_id: str | None = None
    secret_access_key: str | None = None


# ── public ────────────────────────────────────────────────────────────────────


@router.get("/config")
async def get_public_config(db: DbSession) -> dict[str, Any]:
    cfg = await service.get_config(db)
    return service.public_config(cfg)


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def request_upload(
    payload: UploadRequest,
    request: Request,
    db: DbSession,
) -> dict[str, Any]:
    """Token-only: only admin-approved vod-pipeline tokens can presign uploads.

    No anonymous free run - MediaConvert minutes are real money, so usage is
    tied strictly to an issued 24h key (dev-mode admin IPs still bypass).
    """
    cfg = await service.get_config(db)
    if not service.is_deployed(cfg):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "VOD pipeline is not deployed yet")

    error = service.validate_upload(payload.filename, payload.size_bytes, payload.content_type)
    if error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)

    # Enforce access AFTER validation so bad requests never burn a token use.
    await check_app_access(
        db, request, "vod-pipeline", request.headers.get("X-App-Token"), allow_free_run=False
    )

    ip = _client_ip(request)
    job, signed = await service.create_upload(
        db,
        cfg,
        filename=payload.filename,
        size_bytes=payload.size_bytes,
        content_type=payload.content_type,
        client_ip=ip,
        is_guest=True,
        token_id=None,
    )
    return {"job_id": job.job_id, "upload": signed, "expires_in": service.PRESIGN_TTL_SECONDS}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, db: DbSession) -> dict[str, Any]:
    job = await db.scalar(select(VodJob).where(VodJob.job_id == job_id))
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    cfg = await service.get_config(db)
    job = await service.sync_job(db, cfg, job)
    return service.job_dict(job)


# ── admin ─────────────────────────────────────────────────────────────────────

@router.get("/admin/config", dependencies=[Depends(require_admin())])
async def admin_get_config(db: DbSession) -> dict[str, Any]:
    cfg = await service.get_config(db)
    # Never echo the secret key back to the client.
    safe = {k: ("<set>" if k == "secret_access_key" and v else v) for k, v in cfg.items()}
    return {**safe, "deployed": service.is_deployed(cfg)}


@router.put("/admin/config", dependencies=[Depends(require_admin())])
async def admin_put_config(payload: ConfigUpdate, db: DbSession) -> dict[str, Any]:
    current = await service.get_config(db)
    updates = payload.model_dump(exclude_unset=True)
    # "<set>" placeholder means "keep the stored secret".
    if updates.get("secret_access_key") == "<set>":
        updates.pop("secret_access_key")
    cfg = await service.save_config(db, {**current, **updates})
    safe = {k: ("<set>" if k == "secret_access_key" and v else v) for k, v in cfg.items()}
    return {**safe, "deployed": service.is_deployed(cfg)}


@router.get("/admin/jobs", dependencies=[Depends(require_admin())])
async def admin_list_jobs(
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    rows = (
        await db.scalars(
            select(VodJob).order_by(VodJob.id.desc()).limit(limit).offset(offset)
        )
    ).all()
    usage = await service.usage_counters(db)
    return {"items": [service.job_dict(j) for j in rows], "usage": usage}


@router.get("/admin/usage", dependencies=[Depends(require_admin())])
async def admin_usage(db: DbSession) -> dict[str, Any]:
    return await service.usage_counters(db)


spec = ModuleSpec(key="vod-pipeline", flag=FLAG, router=router, prefix="", tags=["vod-pipeline"])
