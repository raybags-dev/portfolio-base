"""Job Market Analytics service — orchestrates crawl + analytics."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import JobCrawlRecord, JobCrawlSession
from app.modules.agents.llm import get_provider
from app.modules.hotel_reviews.playwright_engine import CrawlEngine
from app.modules.jobs.analytics import compute_analytics

log = get_logger("jobs.service")


async def _update_progress(db: AsyncSession, session: JobCrawlSession, msg: str) -> None:
    progress = dict(session.progress or {})
    progress.setdefault("log", [])
    progress["log"] = (progress["log"] + [msg])[-50:]
    progress["last_message"] = msg
    progress["updated_at"] = datetime.now(UTC).isoformat()
    session.progress = progress
    await db.commit()


async def run_session(db: AsyncSession, session_id: int) -> dict[str, Any]:
    session = await db.get(JobCrawlSession, session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")
    if session.status == "running":
        raise ValueError("session is already running")

    session.status = "running"
    session.progress = {"log": [], "pages_crawled": 0, "records_collected": 0}
    await db.commit()

    provider = get_provider()
    engine = CrawlEngine(provider, max_pages=session.max_pages)

    records_added = 0

    async def on_record(record: dict, url: str) -> None:
        nonlocal records_added
        db.add(JobCrawlRecord(
            session_id=session.id,
            source_url=url,
            data=record,
            is_valid=True,
        ))
        records_added += 1
        progress = dict(session.progress or {})
        progress["records_collected"] = records_added
        progress["current_url"] = url
        session.progress = progress
        await db.commit()

    async def on_progress(msg: str) -> None:
        await _update_progress(db, session, msg)
        log.info("crawl.progress", session_id=session_id, msg=msg)

    try:
        spec = session.analytics_spec or {}
        cookie_hints = spec.get("cookie_hints")
        selector_hints = spec.get("selector_hints") or None
        pagination_type = spec.get("pagination_type") or "auto"

        records = await engine.run(
            session.target_url,
            session.collection_prompt,
            on_record=on_record,
            on_progress=on_progress,
            cookie_hints=cookie_hints,
            selector_hints=selector_hints,
            pagination_type=pagination_type,
        )

        await on_progress(
            f"Crawl complete. {len(records)} job listings collected. Running analytics..."
        )

        all_records = (
            await db.scalars(
                select(JobCrawlRecord).where(JobCrawlRecord.session_id == session.id)
            )
        ).all()
        raw_data = [r.data for r in all_records]

        analytics = compute_analytics(raw_data, session.analytics_spec or {})
        session.analytics_result = analytics

        session.status = "done"
        progress = dict(session.progress or {})
        progress["records_collected"] = len(all_records)
        progress["charts_computed"] = len(analytics.get("charts", []))
        session.progress = progress
        await db.commit()

        await on_progress(
            f"Analytics complete. {len(analytics.get('charts', []))} charts generated."
        )
        return {"session_id": session.id, "records": len(all_records), "analytics": analytics}

    except Exception as exc:
        session.status = "failed"
        session.error = str(exc)
        await db.commit()
        log.error("jobs.session.failed", session_id=session_id, error=str(exc))
        raise
