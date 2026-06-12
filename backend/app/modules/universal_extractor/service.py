"""Universal Data Extractor service — orchestration layer."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import UDERecord, UDESession
from app.modules.agents.llm import get_provider
from app.modules.universal_extractor.analytics import compute_analytics
from app.modules.universal_extractor.extractor import apply_schema, extract, validate_record

log = get_logger("ude.service")


async def _update_progress(db: AsyncSession, session: UDESession, msg: str) -> None:
    progress = dict(session.progress or {})
    progress.setdefault("log", [])
    progress["log"] = (progress["log"] + [msg])[-50:]
    progress["last_message"] = msg
    progress["updated_at"] = datetime.now(UTC).isoformat()
    session.progress = progress
    await db.commit()


async def run_session(db: AsyncSession, session_id: int) -> dict[str, Any]:
    session = await db.get(UDESession, session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")
    if session.status == "running":
        raise ValueError("session is already running")

    session.status = "running"
    session.progress = {
        "log": [],
        "records_collected": 0,
        "records_valid": 0,
        "source_type_detected": "",
        "schema_fields": [],
    }
    await db.commit()

    provider = get_provider()
    records_added = 0
    records_valid = 0

    async def on_progress(msg: str) -> None:
        await _update_progress(db, session, msg)
        log.info("ude.progress", session_id=session_id, msg=msg)

    try:
        spec = session.source_config or {}
        detected_type, raw_records, schema = await extract(
            source_url=session.source_url,
            extraction_prompt=session.extraction_prompt,
            source_type=session.source_type or "auto",
            source_config=spec,
            max_records=session.max_records,
            max_pages=spec.get("max_pages", 5),
            provider=provider,
            on_progress=on_progress,
        )

        await on_progress(f"Detected source: {detected_type}. Normalising {len(raw_records)} records…")

        # Apply schema normalisation
        normalised = apply_schema(raw_records, schema) if schema else raw_records

        # Store records
        for raw, norm in zip(raw_records, normalised, strict=False):
            is_valid, errors = validate_record(norm)
            db.add(UDERecord(
                session_id=session.id,
                source_url=session.source_url,
                data=raw,
                normalised_data=norm,
                is_valid=is_valid,
                validation_errors=errors or None,
            ))
            records_added += 1
            if is_valid:
                records_valid += 1

            if records_added % 50 == 0:
                await db.commit()
                progress = dict(session.progress or {})
                progress["records_collected"] = records_added
                progress["records_valid"] = records_valid
                session.progress = progress
                await db.commit()

        await db.commit()
        await on_progress(f"{records_added} records stored ({records_valid} valid). Running analytics…")

        # Analytics on normalised data
        all_records_q = await db.scalars(
            select(UDERecord).where(UDERecord.session_id == session.id)
        )
        all_db_records = all_records_q.all()
        normalised_data = [r.normalised_data or r.data for r in all_db_records]

        analytics = compute_analytics(normalised_data, session.analytics_spec or {})
        session.analytics_result = analytics
        session.source_type_detected = detected_type
        session.schema_detected = schema
        session.status = "done"

        progress = dict(session.progress or {})
        progress["records_collected"] = records_added
        progress["records_valid"] = records_valid
        progress["source_type_detected"] = detected_type
        progress["schema_fields"] = list(schema.keys()) if schema else analytics.get("fields_found", [])
        progress["charts_computed"] = len(analytics.get("charts", []))
        session.progress = progress
        await db.commit()

        await on_progress(
            f"Done. {len(analytics.get('charts', []))} charts generated from {records_added} records."
        )
        return {
            "session_id": session.id,
            "records": records_added,
            "source_type": detected_type,
            "analytics": analytics,
        }

    except Exception as exc:
        session.status = "failed"
        session.error = str(exc)
        await db.commit()
        log.error("ude.session.failed", session_id=session_id, error=str(exc))
        raise


# ── Optional MongoDB mirroring ────────────────────────────────────────────────

async def _mirror_to_mongodb(session_id: int, records: list[dict]) -> None:
    """Fire-and-forget: copy records to MongoDB if configured."""
    from app.core.config import settings
    url = getattr(settings, "MONGODB_URL", None)
    if not url:
        return
    try:
        import asyncio

        import pymongo  # type: ignore[import]

        def _sync_insert() -> None:
            client = pymongo.MongoClient(url, serverSelectionTimeoutMS=5000)
            db = client["raybags_ude"]
            col = db[f"session_{session_id}"]
            if records:
                col.insert_many(records)
            client.close()

        await asyncio.get_event_loop().run_in_executor(None, _sync_insert)
        log.info("ude.mongodb.mirrored", session_id=session_id, count=len(records))
    except Exception as exc:
        log.warning("ude.mongodb.failed", error=str(exc))
