"""In-process async ticker.

Dependency-free background loop that periodically runs due jobs *only while*
``ENABLE_SCHEDULER`` is on — so the admin can turn scheduling on/off at runtime
with no restart. Started/stopped from the app lifespan. For multi-worker or
heavy schedules, swap this for the optional APScheduler/Celery runner.
"""

from __future__ import annotations

import asyncio

from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.modules.scheduler.service import run_due
from app.services.feature_flags import flags

log = get_logger("scheduler.runner")

_DEFAULT_INTERVAL = 15  # seconds between ticks


async def _loop(interval: int) -> None:
    log.info("scheduler.ticker.started", interval=interval)
    while True:
        try:
            await asyncio.sleep(interval)
            async with SessionLocal() as db:
                if await flags.is_enabled(db, "ENABLE_SCHEDULER"):
                    await run_due(db)
        except asyncio.CancelledError:
            log.info("scheduler.ticker.stopped")
            raise
        except Exception as exc:  # never let the ticker die on a transient error
            log.warning("scheduler.ticker.error", error=str(exc))


def start_ticker(interval: int = _DEFAULT_INTERVAL) -> asyncio.Task:
    return asyncio.create_task(_loop(interval))


async def stop_ticker(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
