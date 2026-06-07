"""Crawler API — gated by ENABLE_CRAWLERS."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession, require_admin, require_flag
from app.models.platform import CrawlerJob, CrawlerLog, CrawlerResult
from app.modules import ModuleSpec
from app.modules.crawlers import service

FLAG = "ENABLE_CRAWLERS"

router = APIRouter(
    prefix="/crawlers",
    tags=["crawlers"],
    dependencies=[Depends(require_flag(FLAG))],
)


class JobCreate(BaseModel):
    name: str
    target_key: str | None = None
    start_urls: list[str] = []
    selectors: dict[str, Any] = {}
    schedule_cron: str | None = None
    config: dict[str, Any] | None = None


class AdhocRequest(BaseModel):
    url: str
    config: dict[str, Any]


def _job_dict(j: CrawlerJob) -> dict[str, Any]:
    return {
        "id": j.id, "name": j.name, "target_key": j.target_key,
        "start_urls": j.start_urls, "selectors": j.selectors,
        "status": j.status, "is_enabled": j.is_enabled,
        "last_run_at": j.last_run_at,
    }


@router.get("/jobs")
async def list_jobs(db: DbSession):
    rows = (await db.scalars(select(CrawlerJob).order_by(CrawlerJob.id))).all()
    return [_job_dict(j) for j in rows]


@router.post("/jobs", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin())])
async def create_job(payload: JobCreate, db: DbSession):
    job = CrawlerJob(**payload.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return _job_dict(job)


@router.post("/jobs/{job_id}/run", dependencies=[Depends(require_admin())])
async def run_job(job_id: int, db: DbSession) -> dict[str, Any]:
    try:
        return await service.run_job(db, job_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/adhoc", dependencies=[Depends(require_admin())])
async def adhoc(payload: AdhocRequest) -> dict[str, Any]:
    return await service.run_adhoc(payload.url, payload.config)


@router.get("/jobs/{job_id}/logs")
async def job_logs(job_id: int, db: DbSession, limit: int = Query(100, ge=1, le=500)):
    rows = (
        await db.scalars(
            select(CrawlerLog).where(CrawlerLog.job_id == job_id)
            .order_by(CrawlerLog.id.desc()).limit(limit)
        )
    ).all()
    return [
        {"id": r.id, "level": r.level, "message": r.message,
         "healing_event": r.healing_event, "created_at": r.created_at}
        for r in rows
    ]


@router.get("/jobs/{job_id}/results")
async def job_results(job_id: int, db: DbSession, limit: int = Query(100, ge=1, le=500)):
    rows = (
        await db.scalars(
            select(CrawlerResult).where(CrawlerResult.job_id == job_id)
            .order_by(CrawlerResult.id.desc()).limit(limit)
        )
    ).all()
    return [{"id": r.id, "payload": r.payload, "row_count": r.row_count} for r in rows]


spec = ModuleSpec(key="crawlers", flag=FLAG, router=router, prefix="", tags=["crawlers"])
