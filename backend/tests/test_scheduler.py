"""Scheduler tests — offline (interval scheduling + agent task)."""

from datetime import UTC, datetime, timedelta

from app.core.database import SessionLocal
from app.models.platform import ScheduledJob
from app.modules.scheduler.service import compute_next_run, is_due, run_due, run_now


async def test_interval_job_is_due_and_reschedules():
    async with SessionLocal() as db:
        job = ScheduledJob(name="tick-noop", task="noop", interval_seconds=60,
                           args={"hello": "world"}, is_enabled=True)
        db.add(job)
        await db.commit()
        await db.refresh(job)

        # never run yet → due now
        now = datetime.now(UTC)
        assert is_due(job, now) is True

        ran = await run_due(db, now)
        ids = {r["job_id"] for r in ran}
        assert job.id in ids

        await db.refresh(job)
        assert job.last_run_at is not None
        assert job.next_run_at is not None
        # not due again until the interval elapses
        assert is_due(job, now) is False


async def test_disabled_job_not_due():
    async with SessionLocal() as db:
        job = ScheduledJob(name="off", task="noop", interval_seconds=10, is_enabled=False)
        db.add(job)
        await db.commit()
        assert is_due(job, datetime.now(UTC)) is False


async def test_compute_next_run_interval():
    job = ScheduledJob(name="x", task="noop", interval_seconds=120)
    base = datetime(2026, 1, 1, tzinfo=UTC)
    assert compute_next_run(job, base) == base + timedelta(seconds=120)


async def test_run_now_agent_workflow():
    async with SessionLocal() as db:
        job = ScheduledJob(
            name="nightly-insight",
            task="agent.run_workflow",
            interval_seconds=3600,
            args={"workflow": "insight", "input": {"topic": "energy", "points": [1]}},
            is_enabled=True,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        result = await run_now(db, job.id)
        assert result["ok"] is True
        assert result["output"]["validated"] is True


async def test_unknown_task_marks_failed():
    async with SessionLocal() as db:
        job = ScheduledJob(name="bad", task="does.not.exist",
                           interval_seconds=60, is_enabled=True)
        db.add(job)
        await db.commit()
        await db.refresh(job)
        result = await run_now(db, job.id)
        assert result["ok"] is False
        await db.refresh(job)
        assert job.status == "failed"


# ---- API gating ----
async def test_scheduler_gated(client, auth_headers):
    assert (await client.get("/api/v1/scheduler/jobs")).status_code == 404
    await client.put("/api/v1/feature-flags/ENABLE_SCHEDULER",
                     headers=auth_headers, json={"enabled": True})
    resp = await client.get("/api/v1/scheduler/tasks")
    assert resp.status_code == 200
    assert "crawler.run_job" in resp.json()
    await client.put("/api/v1/feature-flags/ENABLE_SCHEDULER",
                     headers=auth_headers, json={"enabled": False})
