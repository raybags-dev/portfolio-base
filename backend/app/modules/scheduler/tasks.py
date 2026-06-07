"""Registry of runnable scheduled tasks.

A task is an async callable ``(db, args) -> dict``. Modules register tasks here
so the scheduler can invoke them by name from a `ScheduledJob` row.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

TaskFn = Callable[[AsyncSession, dict[str, Any]], Awaitable[dict[str, Any]]]

_TASKS: dict[str, TaskFn] = {}


def register_task(name: str) -> Callable[[TaskFn], TaskFn]:
    def deco(fn: TaskFn) -> TaskFn:
        _TASKS[name] = fn
        return fn

    return deco


def get_task(name: str) -> TaskFn | None:
    return _TASKS.get(name)


def available_tasks() -> list[str]:
    return sorted(_TASKS)


# ---- built-in tasks ----
@register_task("noop")
async def _noop(db: AsyncSession, args: dict[str, Any]) -> dict[str, Any]:
    return {"ok": True, "echo": args}


@register_task("crawler.run_job")
async def _run_crawler_job(db: AsyncSession, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.crawlers import service as crawler_service

    job_id = int(args["job_id"])
    return await crawler_service.run_job(db, job_id)


@register_task("agent.run_workflow")
async def _run_agent_workflow(db: AsyncSession, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.agents.service import AgentService

    return await AgentService.run(
        db, args["workflow"], args.get("input", {}), title=args.get("title")
    )
