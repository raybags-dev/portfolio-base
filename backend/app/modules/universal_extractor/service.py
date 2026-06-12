"""Universal Data Extractor service — orchestration layer."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from functools import partial
from typing import Any

from sqlalchemy import insert as sa_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import UDERecord, UDESession
from app.modules.agents.llm import get_provider
from app.modules.universal_extractor.analytics import compute_analytics
from app.modules.universal_extractor.extractor import apply_schema, extract, validate_record

log = get_logger("ude.service")

# Records inserted per DB transaction — keeps identity map small and gives
# frequent progress updates even for very large datasets.
_BATCH_SIZE = 200


async def _update_progress(db: AsyncSession, session: UDESession, msg: str) -> None:
    progress = dict(session.progress or {})
    progress.setdefault("log", [])
    progress["log"] = (progress["log"] + [msg])[-50:]
    progress["last_message"] = msg
    progress["updated_at"] = datetime.now(UTC).isoformat()
    session.progress = progress
    await db.commit()


async def _upload_raw_to_s3(session_id: int, raw_records: list[dict]) -> str | None:
    """Serialize raw records to JSON and push to S3. Returns S3 key or None."""
    try:
        from app.core.storage_s3 import is_configured, upload_blob
        if not is_configured():
            return None
        key = f"ude/sessions/{session_id}/raw_records.json"
        # Serialise in a thread so we don't block the event loop on large blobs
        loop = asyncio.get_event_loop()
        payload: str = await loop.run_in_executor(
            None, partial(json.dumps, raw_records, default=str, ensure_ascii=False)
        )
        await upload_blob(key, payload, content_type="application/json")
        log.info("ude.s3.uploaded", session_id=session_id, key=key, bytes=len(payload))
        return key
    except Exception as exc:
        log.warning("ude.s3.upload_failed", session_id=session_id, error=str(exc))
        return None


async def _store_records_in_batches(
    db: AsyncSession,
    session: UDESession,
    raw_records: list[dict],
    normalised_records: list[dict],
    on_progress: Any,
) -> tuple[int, int]:
    """Insert records using core bulk-INSERT in batches of _BATCH_SIZE.

    Uses SQLAlchemy core INSERT (bypasses the ORM identity map) so memory
    stays constant regardless of dataset size. Returns (added, valid).
    """
    total = len(raw_records)
    added = 0
    valid = 0

    # For paste/inline data, store a short placeholder as record source_url
    # to avoid bloating the ude_records table with the full blob per row.
    is_text = session.source_type == "text"
    record_source = (
        f"[inline:{total}records]" if is_text else (session.source_url or "")[:512]
    )

    for batch_start in range(0, total, _BATCH_SIZE):
        batch_raw  = raw_records[batch_start : batch_start + _BATCH_SIZE]
        batch_norm = normalised_records[batch_start : batch_start + _BATCH_SIZE]

        rows: list[dict] = []
        for raw, norm in zip(batch_raw, batch_norm, strict=False):
            is_valid, errors = validate_record(norm)
            rows.append({
                "session_id": session.id,
                "source_url": record_source,
                "data": raw,
                "normalised_data": norm,
                "is_valid": is_valid,
                "validation_errors": errors or None,
            })
            added += 1
            if is_valid:
                valid += 1

        # Core INSERT — no ORM tracking, no identity-map growth
        await db.execute(sa_insert(UDERecord), rows)
        await db.commit()

        # Update progress counter
        progress = dict(session.progress or {})
        progress["records_collected"] = added
        progress["records_valid"] = valid
        session.progress = progress
        await db.commit()

        pct = int(added / total * 100) if total else 100
        await on_progress(f"Stored {added:,}/{total:,} records ({pct}%)…")

    return added, valid


async def _mirror_to_mongodb(
    session_id: int,
    session_name: str,
    source_url: str,
    records: list[dict],
    analytics: dict,
) -> str | None:
    """Store normalised records + analytics in MongoDB in chunks of 1 000.

    Returns collection name or None.
    """
    from app.core.config import settings
    url = getattr(settings, "MONGODB_URL", None)
    if not url:
        return None

    collection_name = f"ude_session_{session_id}"
    _MONGO_CHUNK = 1_000

    try:
        import pymongo  # type: ignore[import]

        def _sync_insert() -> None:
            client = pymongo.MongoClient(url, serverSelectionTimeoutMS=5000)
            db = client["raybags_ude"]

            # Upsert session metadata
            db["ude_sessions"].update_one(
                {"session_id": session_id},
                {"$set": {
                    "session_id": session_id,
                    "name": session_name,
                    "source_url": source_url[:512],
                    "record_count": len(records),
                    "analytics_summary": {
                        "total_records": analytics.get("total_records", 0),
                        "fields_found": analytics.get("fields_found", []),
                        "numeric_fields": analytics.get("numeric_fields", []),
                        "category_fields": analytics.get("category_fields", []),
                    },
                    "updated_at": datetime.now(UTC).isoformat(),
                }},
                upsert=True,
            )

            col = db[collection_name]
            col.delete_many({})

            # Insert in chunks to avoid a single huge insert_many
            for chunk_start in range(0, len(records), _MONGO_CHUNK):
                chunk = records[chunk_start : chunk_start + _MONGO_CHUNK]
                if chunk:
                    col.insert_many([{"session_id": session_id, **r} for r in chunk])

            client.close()

        await asyncio.get_event_loop().run_in_executor(None, _sync_insert)
        log.info("ude.mongodb.stored", session_id=session_id, count=len(records))
        return collection_name
    except Exception as exc:
        log.warning("ude.mongodb.failed", error=str(exc))
        return None


async def run_session(db: AsyncSession, session_id: int) -> dict[str, Any]:
    session = await db.get(UDESession, session_id)
    if session is None:
        raise ValueError(f"session {session_id} not found")
    if session.status == "cancelled":
        return {"session_id": session_id, "records": 0, "cancelled": True}

    # Router already committed status=running; just ensure progress is initialised
    if session.status != "running":
        session.status = "running"
    if not session.progress:
        session.progress = {}
    progress = dict(session.progress)
    progress.setdefault("log", [])
    progress.setdefault("records_collected", 0)
    progress.setdefault("records_valid", 0)
    progress.setdefault("source_type_detected", "")
    progress.setdefault("schema_fields", [])
    session.progress = progress
    await db.commit()

    provider = get_provider()
    loop = asyncio.get_event_loop()

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

        await on_progress(
            f"Detected source: {detected_type}. {len(raw_records):,} raw records. Uploading to S3…"
        )

        # ── Upload raw records to S3 (non-blocking) ───────────────────────────
        s3_key = await _upload_raw_to_s3(session_id, raw_records)
        if s3_key:
            session.raw_s3_key = s3_key
            await db.commit()
            await on_progress("Raw blob saved to S3. Normalising schema…")
        else:
            await on_progress(f"Normalising {len(raw_records):,} records…")

        # ── LLM schema normalisation (CPU — run in thread) ────────────────────
        if schema:
            normalised: list[dict] = await loop.run_in_executor(
                None, apply_schema, raw_records, schema
            )
        else:
            normalised = raw_records

        # ── Batch-insert records into Postgres ────────────────────────────────
        await on_progress(
            f"Storing {len(raw_records):,} records in batches of {_BATCH_SIZE}…"
        )
        records_added, records_valid = await _store_records_in_batches(
            db, session, raw_records, normalised, on_progress
        )

        # ── Analytics on the in-memory normalised list (no DB re-fetch!) ──────
        await on_progress(f"{records_added:,} records stored. Computing analytics…")
        analytics = await loop.run_in_executor(
            None, compute_analytics, normalised, session.analytics_spec or {}
        )

        session.analytics_result = analytics
        session.source_type_detected = detected_type
        session.schema_detected = schema
        session.status = "done"
        # For paste/text, replace the raw blob with a clean label so blog gen,
        # API responses, and MongoDB don't carry 2MB strings.
        if session.source_type == "text" and not (session.source_url or "").startswith("["):
            session.source_url = f"[inline:{records_added}records]"

        progress = dict(session.progress or {})
        progress["records_collected"] = records_added
        progress["records_valid"] = records_valid
        progress["source_type_detected"] = detected_type
        progress["schema_fields"] = list(schema.keys()) if schema else analytics.get("fields_found", [])
        progress["charts_computed"] = len(analytics.get("charts", []))
        session.progress = progress
        await db.commit()

        # ── Mirror to MongoDB in chunks ────────────────────────────────────────
        await on_progress(f"Mirroring {records_added:,} records to MongoDB…")
        mongo_col = await _mirror_to_mongodb(
            session_id=session.id,
            session_name=session.name,
            source_url=session.source_url[:512],
            records=normalised,
            analytics=analytics,
        )
        if mongo_col:
            session.mongodb_collection = mongo_col
            await db.commit()

        await on_progress(
            f"Done. {len(analytics.get('charts', []))} charts from {records_added:,} records."
        )
        return {
            "session_id": session.id,
            "records": records_added,
            "source_type": detected_type,
            "analytics": analytics,
        }

    except Exception as exc:
        session.status = "failed"
        session.error = str(exc)[:2000]
        await db.commit()
        log.error("ude.session.failed", session_id=session_id, error=str(exc))
        raise
