"""Hotel Review Analytics service — orchestrates crawl + analytics + blog."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import CrawlerProfile, HotelCrawlRecord, HotelCrawlSession
from app.modules.agents.llm import get_provider
from app.modules.hotel_reviews.analytics import compute_analytics
from app.modules.hotel_reviews.playwright_engine import CrawlEngine

log = get_logger("hotel_reviews.service")


async def _update_progress(db: AsyncSession, session: HotelCrawlSession, msg: str) -> None:
    progress = dict(session.progress or {})
    progress.setdefault("log", [])
    progress["log"] = (progress["log"] + [msg])[-50:]  # keep last 50 lines
    progress["last_message"] = msg
    progress["updated_at"] = datetime.now(UTC).isoformat()
    session.progress = progress
    await db.commit()


async def run_session(db: AsyncSession, session_id: int) -> dict[str, Any]:
    session = await db.get(HotelCrawlSession, session_id)
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
        db.add(HotelCrawlRecord(
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
        pre_actions = spec.get("pre_actions") or None
        container_selector = spec.get("container_selector") or None
        item_selector = spec.get("item_selector") or None
        field_map = spec.get("field_map") or None

        profile_id = spec.get("profile_id")
        if profile_id:
            profile = await db.get(CrawlerProfile, int(profile_id))
            if profile and profile.fields_config:
                fc = profile.fields_config
                loop_cfg = fc.get("loop") or {}
                fields = fc.get("fields") or {}
                if loop_cfg.get("enabled"):
                    container_selector = container_selector or loop_cfg.get("container_selector") or None
                    item_selector = item_selector or loop_cfg.get("item_selector") or None
                if fields and not field_map:
                    css_map = {
                        fn: fd["selector"]
                        for fn, fd in fields.items()
                        if fd.get("selector_type") == "css" and fd.get("selector")
                    }
                    if css_map:
                        field_map = css_map
                        selector_hints = selector_hints or css_map
                    regexp_hints = {
                        fn: fd["selector"]
                        for fn, fd in fields.items()
                        if fd.get("selector_type") == "regexp" and fd.get("selector")
                    }
                    if regexp_hints:
                        selector_hints = {**(selector_hints or {}), **regexp_hints}
                await on_progress(
                    f"Applying crawler profile '{profile.name}' — {len(fields)} configured field(s)."
                )

        records = await engine.run(
            session.target_url,
            session.collection_prompt,
            on_record=on_record,
            on_progress=on_progress,
            cookie_hints=cookie_hints,
            selector_hints=selector_hints,
            pagination_type=pagination_type,
            pre_actions=pre_actions,
            container_selector=container_selector,
            item_selector=item_selector,
            field_map=field_map,
        )

        await on_progress(f"Crawl complete. {len(records)} records collected. Running analytics...")

        # Fetch all records for analytics
        all_records = (
            await db.scalars(
                select(HotelCrawlRecord).where(HotelCrawlRecord.session_id == session.id)
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

        await on_progress(f"Analytics complete. {len(analytics.get('charts', []))} charts generated.")
        return {"session_id": session.id, "records": len(all_records), "analytics": analytics}

    except Exception as exc:
        session.status = "failed"
        session.error = str(exc)
        await db.commit()
        log.error("hotel_reviews.session.failed", session_id=session_id, error=str(exc))
        raise


async def run_kaggle_import(db: AsyncSession, session_id: int, dataset_ref: str) -> dict[str, Any]:
    """Download a Kaggle dataset, store records, run analytics."""
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")

    session.status = "running"
    session.progress = {"log": [], "records_collected": 0, "source": "kaggle"}
    await db.commit()

    async def _progress(msg: str) -> None:
        progress = dict(session.progress or {})
        progress.setdefault("log", [])
        progress["log"] = (progress["log"] + [msg])[-50:]
        progress["last_message"] = msg
        session.progress = progress
        await db.commit()

    try:
        from app.modules.shared.kaggle import download_and_parse

        await _progress(f"Connecting to Kaggle and downloading '{dataset_ref}'…")
        raw_rows = await download_and_parse(dataset_ref)

        await _progress(f"Downloaded {len(raw_rows)} rows. Storing records…")
        for row in raw_rows:
            db.add(HotelCrawlRecord(
                session_id=session.id,
                source_url=f"kaggle://{dataset_ref}",
                data=row,
                is_valid=True,
            ))
        await db.commit()

        await _progress(f"{len(raw_rows)} records stored. Running analytics…")
        analytics = compute_analytics(raw_rows, session.analytics_spec or {})
        session.analytics_result = analytics
        session.status = "done"
        progress = dict(session.progress or {})
        progress["records_collected"] = len(raw_rows)
        progress["charts_computed"] = len(analytics.get("charts", []))
        session.progress = progress
        await db.commit()

        await _progress(f"Done. {len(analytics.get('charts', []))} charts generated.")
        return {"session_id": session.id, "records": len(raw_rows), "analytics": analytics}

    except Exception as exc:
        session.status = "failed"
        session.error = str(exc)
        await db.commit()
        log.error("hotel_reviews.kaggle.failed", session_id=session_id, error=str(exc))
        raise


async def run_curl_import(db: AsyncSession, session_id: int) -> dict[str, Any]:
    """Parse stored cURL command, fetch paginated data, run analytics."""
    from app.modules.hotel_reviews.curl_importer import fetch_curl_pages, parse_curl

    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")

    spec = session.analytics_spec or {}
    curl_command = spec.get("curl_command", "")
    page_count = int(spec.get("page_count", 5))

    session.status = "running"
    session.progress = {"log": [], "records_collected": 0, "source": "curl"}
    await db.commit()

    async def _progress(msg: str) -> None:
        progress = dict(session.progress or {})
        progress.setdefault("log", [])
        progress["log"] = (progress["log"] + [msg])[-50:]
        progress["last_message"] = msg
        session.progress = progress
        await db.commit()

    try:
        await _progress("Parsing cURL command…")
        parsed = parse_curl(curl_command)

        await _progress(
            f"Detected: {parsed['method']} {parsed['url'][:80]} — "
            f"fetching {page_count} page(s)…"
        )

        records = await fetch_curl_pages(
            parsed, page_count, session.collection_prompt, on_progress=_progress
        )

        await _progress(f"{len(records)} records collected. Storing…")
        for rec in records:
            db.add(HotelCrawlRecord(
                session_id=session.id,
                source_url=parsed["url"],
                data=rec,
                is_valid=True,
            ))
        await db.commit()

        await _progress(f"Running analytics on {len(records)} records…")
        analytics = compute_analytics(records, spec)
        session.analytics_result = analytics
        session.status = "done"
        progress = dict(session.progress or {})
        progress["records_collected"] = len(records)
        progress["charts_computed"] = len(analytics.get("charts", []))
        session.progress = progress
        await db.commit()

        await _progress(f"Done. {len(analytics.get('charts', []))} charts generated.")
        return {"session_id": session.id, "records": len(records), "analytics": analytics}

    except Exception as exc:
        session.status = "failed"
        session.error = str(exc)
        await db.commit()
        log.error("hotel_reviews.curl.failed", session_id=session_id, error=str(exc))
        raise
