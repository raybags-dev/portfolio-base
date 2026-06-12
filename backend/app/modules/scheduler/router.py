"""Scheduler API — gated by ENABLE_SCHEDULER."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession, require_admin, require_flag
from app.models.platform import ScheduledJob
from app.modules import ModuleSpec
from app.modules.scheduler import service
from app.modules.scheduler.tasks import available_tasks

FLAG = "ENABLE_SCHEDULER"

router = APIRouter(
    prefix="/scheduler",
    tags=["scheduler"],
    dependencies=[Depends(require_flag(FLAG))],
)


class JobCreate(BaseModel):
    name: str
    task: str
    cron: str | None = None
    interval_seconds: int | None = None
    args: dict[str, Any] = {}
    is_enabled: bool = True


class JobUpdate(BaseModel):
    name: str | None = None
    cron: str | None = None
    interval_seconds: int | None = None
    args: dict[str, Any] | None = None
    is_enabled: bool | None = None


def _dict(j: ScheduledJob) -> dict[str, Any]:
    return {
        "id": j.id, "name": j.name, "task": j.task, "cron": j.cron,
        "interval_seconds": j.interval_seconds, "args": j.args,
        "is_enabled": j.is_enabled, "status": j.status,
        "last_run_at": j.last_run_at, "next_run_at": j.next_run_at,
        "last_error": j.last_error,
    }


@router.get("/tasks", response_model=list[str])
async def list_tasks() -> list[str]:
    return available_tasks()


@router.get("/jobs")
async def list_jobs(db: DbSession):
    rows = (await db.scalars(select(ScheduledJob).order_by(ScheduledJob.id))).all()
    return [_dict(j) for j in rows]


@router.post("/jobs", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin())])
async def create_job(payload: JobCreate, db: DbSession):
    if available_tasks() and payload.task not in available_tasks():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown task '{payload.task}'")
    job = ScheduledJob(**payload.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return _dict(job)


@router.put("/jobs/{job_id}", dependencies=[Depends(require_admin())])
async def update_job(job_id: int, payload: JobUpdate, db: DbSession):
    job = await db.get(ScheduledJob, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(job, k, v)
    await db.commit()
    await db.refresh(job)
    return _dict(job)


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin())])
async def delete_job(job_id: int, db: DbSession):
    job = await db.get(ScheduledJob, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    await db.delete(job)
    await db.commit()


@router.post("/jobs/{job_id}/run", dependencies=[Depends(require_admin())])
async def run_now(job_id: int, db: DbSession) -> dict[str, Any]:
    try:
        return await service.run_now(db, job_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/tick", dependencies=[Depends(require_admin())])
async def tick(db: DbSession) -> dict[str, Any]:
    """Run all due jobs now (manual trigger / external cron hook)."""
    ran = await service.run_due(db)
    return {"ran": len(ran), "jobs": ran}


spec = ModuleSpec(key="scheduler", flag=FLAG, router=router, prefix="", tags=["scheduler"])
