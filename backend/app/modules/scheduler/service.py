"""Scheduler core: due-job computation and execution (offline-testable)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import ScheduledJob
from app.modules.scheduler.tasks import get_task

log = get_logger("scheduler.service")


def _aware(dt: datetime | None) -> datetime | None:
    """Normalise possibly-naive DB timestamps to UTC-aware for comparison."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def compute_next_run(job: ScheduledJob, after: datetime) -> datetime | None:
    """Next run time after ``after``. Interval is native; cron needs croniter."""
    if job.interval_seconds:
        return after + timedelta(seconds=int(job.interval_seconds))
    if job.cron:
        try:
            from croniter import croniter  # optional dependency

            return croniter(job.cron, after).get_next(datetime)
        except Exception as exc:  # croniter missing or bad expression
            log.warning("scheduler.cron.unavailable", job=job.name, error=str(exc))
            return None
    return None


def is_due(job: ScheduledJob, now: datetime) -> bool:
    if not job.is_enabled:
        return False
    nxt = _aware(job.next_run_at)
    if nxt is None:
        # never scheduled: due immediately if it has any cadence
        return bool(job.interval_seconds or job.cron)
    return nxt <= now


async def run_one(db: AsyncSession, job: ScheduledJob, now: datetime) -> dict[str, Any]:
    task = get_task(job.task)
    job.status = "running"
    await db.commit()
    result: dict[str, Any]
    if task is None:
        job.status = "failed"
        result = {"ok": False, "error": f"unknown task '{job.task}'"}
        log.warning("scheduler.unknown_task", task=job.task, job=job.name)
    else:
        try:
            output = await task(db, job.args or {})
            job.status = "scheduled"
            result = {"ok": True, "output": output}
        except Exception as exc:
            job.status = "failed"
            result = {"ok": False, "error": str(exc)}
            log.warning("scheduler.task_failed", task=job.task, error=str(exc))
    job.last_run_at = now
    job.next_run_at = compute_next_run(job, now)
    await db.commit()
    return {"job_id": job.id, "name": job.name, **result, "next_run_at": job.next_run_at}


async def run_due(db: AsyncSession, now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or datetime.now(UTC)
    jobs = (
        await db.scalars(select(ScheduledJob).where(ScheduledJob.is_enabled.is_(True)))
    ).all()
    ran: list[dict[str, Any]] = []
    for job in jobs:
        if is_due(job, now):
            ran.append(await run_one(db, job, now))
    if ran:
        log.info("scheduler.tick", ran=len(ran))
    return ran


async def run_now(db: AsyncSession, job_id: int) -> dict[str, Any]:
    job = await db.get(ScheduledJob, job_id)
    if job is None:
        raise ValueError(f"scheduled job {job_id} not found")
    return await run_one(db, job, datetime.now(UTC))
