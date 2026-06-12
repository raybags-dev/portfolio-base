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


@register_task("news.extract_cnn")
async def _extract_cnn_news(db: AsyncSession, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.news.service import extract_and_store

    return await extract_and_store(
        db,
        source_url=args.get("url", "https://edition.cnn.com/"),
        max_records=int(args.get("max_records", 80)),
        source_name=args.get("source", "CNN"),
    )


@register_task("system.cleanup")
async def _system_cleanup(db: AsyncSession, args: dict[str, Any]) -> dict[str, Any]:
    """Clean stale playwright /tmp artifacts, ensure Chromium installed, check disk."""
    from app.core.health import run_health_check_async

    return await run_health_check_async()


@register_task("streams.ingest")
async def _streams_ingest(db: AsyncSession, args: dict[str, Any]) -> dict[str, Any]:
    """Crawl a URL and publish every extracted record as a stream event.

    Required args:  url, topic
    Optional args:  prompt, max_records (default 50), source_key
    """
    url = args.get("url")
    topic = args.get("topic", "events.raw")
    if not url:
        return {"error": "url arg is required"}

    from app.modules.streams.service import publish_batch
    from app.modules.universal_extractor.crawler import UDECrawler

    prompt = args.get("prompt", "Extract all structured data records")
    max_records = int(args.get("max_records", 50))
    source_key = args.get("source_key") or topic.split(".")[0]

    crawler = UDECrawler(provider=None, max_pages=1)
    _, records = await crawler.crawl(url, prompt, max_records=max_records)
    published = await publish_batch(db, topic, records, source_key=source_key)
    return {"topic": topic, "crawled": len(records), "published": published}


@register_task("ude.extract")
async def _ude_extract(db: AsyncSession, args: dict[str, Any]) -> dict[str, Any]:
    """Generic UDE extraction task — create a session and run it."""
    from app.models.platform import UDESession
    from app.modules.universal_extractor.service import run_session

    session = UDESession(
        name=args.get("name", f"Scheduled: {args.get('source_url', '')[:40]}"),
        source_url=args["source_url"],
        source_type=args.get("source_type", "auto"),
        extraction_prompt=args.get("extraction_prompt", "Extract all available data"),
        max_records=int(args.get("max_records", 200)),
        status="pending",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return await run_session(db, session.id)
