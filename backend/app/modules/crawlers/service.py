"""Crawler service: run jobs, persist results/logs, and save healed selectors."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import CrawlerJob, CrawlerLog, CrawlerResult
from app.modules.agents.llm import get_provider
from app.modules.agents.orchestrator import run_workflow
from app.modules.crawlers.fetch import Fetcher
from app.modules.crawlers.workflow import CrawlWorkflow

log = get_logger("crawlers.service")


async def _log(db: AsyncSession, job_id: int, level: str, message: str,
               healing_event: dict | None = None) -> None:
    db.add(CrawlerLog(job_id=job_id, level=level, message=message,
                      healing_event=healing_event))


async def run_job(
    db: AsyncSession,
    job_id: int,
    *,
    fetcher: Fetcher | None = None,
) -> dict[str, Any]:
    job = await db.get(CrawlerJob, job_id)
    if job is None:
        raise ValueError(f"crawler job {job_id} not found")

    job.status = "running"
    await db.commit()

    provider = get_provider()
    urls = job.start_urls or []
    records: list[dict[str, Any]] = []
    total_healed = 0
    config_after = job.selectors or {}

    try:
        for url in urls:
            workflow = CrawlWorkflow(provider)
            report = await run_workflow(
                workflow,
                {"url": url, "config": job.selectors or {}, "_fetcher": fetcher},
            )

            record = report.get("record", {})
            records.append(record)
            config_after = report.get("updated_config", config_after)

            db.add(CrawlerResult(job_id=job.id, payload=record,
                                 row_count=1, storage_url=url))

            for event in report.get("healing_events", []):
                total_healed += 1
                await _log(db, job.id, "warning",
                           f"self-healed selector for '{event['field']}' "
                           f"via {event['strategy']}", healing_event=event)

            await _log(db, job.id, "info" if report.get("validated") else "error",
                       f"crawled {url}: validated={report.get('validated')}")

        # Persist any selectors the crawler repaired — it updates its own config.
        if total_healed:
            job.selectors = config_after
            await _log(db, job.id, "info",
                       f"updated job config with {total_healed} healed selector(s)")

        job.status = "done"
        job.last_run_at = datetime.now(UTC)
        await db.commit()
    except Exception as exc:
        job.status = "failed"
        await _log(db, job.id, "error", f"crawl failed: {exc}")
        await db.commit()
        log.warning("crawler.job.failed", job_id=job_id, error=str(exc))
        raise

    return {
        "job_id": job.id,
        "urls": len(urls),
        "records": records,
        "healed_selectors": total_healed,
        "config_updated": bool(total_healed),
    }


async def run_adhoc(
    url: str,
    config: dict[str, Any],
    *,
    fetcher: Fetcher | None = None,
) -> dict[str, Any]:
    """Run a one-off crawl without a stored job (demo / preview)."""
    workflow = CrawlWorkflow(get_provider())
    return await run_workflow(
        workflow, {"url": url, "config": config, "_fetcher": fetcher}
    )
