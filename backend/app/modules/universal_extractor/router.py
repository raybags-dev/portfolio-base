"""Universal Data Extractor API — gated by ENABLE_UNIVERSAL_EXTRACTOR."""

from __future__ import annotations

import json
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.access import _client_ip, require_app_access
from app.core.deps import DbSession, require_flag
from app.models.content import Setting
from app.models.platform import UDERecord, UDESession
from app.modules import ModuleSpec

FLAG = "ENABLE_UNIVERSAL_EXTRACTOR"

router = APIRouter(
    prefix="/universal-extractor",
    tags=["universal-extractor"],
    dependencies=[Depends(require_flag(FLAG))],
)


class SessionCreate(BaseModel):
    name: str
    source_url: str
    source_type: str = "auto"          # auto|html|api|csv|json|xml|kaggle|text
    extraction_prompt: str = "Extract all structured data from this source."
    source_config: dict[str, Any] = {}  # headers, max_pages, auth, etc.
    analytics_spec: dict[str, Any] = {}
    max_records: int = 1000
    session_contact: dict[str, Any] | None = None


class SessionPatch(BaseModel):
    analytics_spec: dict[str, Any] | None = None
    extraction_prompt: str | None = None


def _session_dict(s: UDESession) -> dict[str, Any]:
    return {
        "id": s.id,
        "name": s.name,
        "source_url": s.source_url,
        "source_type": s.source_type,
        "source_type_detected": s.source_type_detected,
        "extraction_prompt": s.extraction_prompt,
        "source_config": s.source_config,
        "analytics_spec": s.analytics_spec,
        "max_records": s.max_records,
        "status": s.status,
        "progress": s.progress,
        "analytics_result": s.analytics_result,
        "schema_detected": s.schema_detected,
        "error": s.error,
        "created_at": s.created_at,
        "client_ip": s.client_ip,
        "is_guest": s.is_guest,
        "session_contact": s.session_contact,
    }


@router.get("/sessions")
async def list_sessions(db: DbSession, limit: int = Query(20, ge=1, le=100)):
    rows = (
        await db.scalars(
            select(UDESession).order_by(UDESession.id.desc()).limit(limit)
        )
    ).all()
    return [_session_dict(s) for s in rows]


_MAX_TEXT_BYTES = 2 * 1024 * 1024  # 2 MB hard cap for paste-mode payloads


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate, db: DbSession, request: Request):
    if payload.source_type == "text" and len(payload.source_url.encode()) > _MAX_TEXT_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Paste payload exceeds the 2 MB limit "
            f"({len(payload.source_url.encode()) // 1024:,} KB). "
            "Reduce the dataset or increase max_records to auto-truncate on the client.",
        )

    ip = _client_ip(request)
    is_guest = True
    setting = await db.scalar(select(Setting).where(Setting.key == "dev_mode_ips"))
    if setting:
        try:
            if ip in json.loads(setting.value or "[]"):
                is_guest = False
        except Exception:
            pass

    session = UDESession(
        **payload.model_dump(),
        client_ip=ip,
        is_guest=is_guest,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: DbSession):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return _session_dict(session)


@router.patch("/sessions/{session_id}")
async def patch_session(session_id: int, payload: SessionPatch, db: DbSession):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if payload.analytics_spec is not None:
        session.analytics_spec = payload.analytics_spec
    if payload.extraction_prompt is not None:
        session.extraction_prompt = payload.extraction_prompt
    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, db: DbSession) -> Response:
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    await db.delete(session)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/{session_id}/run", dependencies=[require_app_access("universal-extractor")])
async def run_session(session_id: int, db: DbSession, background_tasks: BackgroundTasks):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "Session already running")
    # Set running immediately so polling sees the state change before background task starts
    session.status = "running"
    session.progress = {"log": [], "records_collected": 0, "records_valid": 0}
    await db.commit()
    background_tasks.add_task(_run_in_background, session_id)
    return {"message": "Extraction started", "session_id": session_id}


@router.post("/sessions/{session_id}/cancel")
async def cancel_session(session_id: int, db: DbSession):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status not in ("pending", "running"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session is not running")
    session.status = "cancelled"
    session.error = "Cancelled by user"
    await db.commit()
    return {"message": "Session cancelled"}


async def _run_in_background(session_id: int) -> None:
    try:
        from app.core.database import SessionLocal
        from app.modules.universal_extractor.service import run_session as _run
    except Exception as import_exc:  # noqa: BLE001
        # Can't import — try to mark session failed via a raw connection
        try:
            from app.core.database import SessionLocal

            async with SessionLocal() as db:
                s = await db.get(UDESession, session_id)
                if s and s.status in ("pending", "running"):
                    s.status = "failed"
                    s.error = f"Startup error: {import_exc}"
                    await db.commit()
        except Exception:
            pass
        return

    async with SessionLocal() as db:
        try:
            await _run(db, session_id)
        except Exception as exc:
            # Service already marks the session failed before re-raising, but
            # make sure it's set in case the exception escaped before that.
            try:
                s = await db.get(UDESession, session_id)
                if s and s.status in ("pending", "running"):
                    s.status = "failed"
                    s.error = str(exc)[:1000]
                    await db.commit()
            except Exception:
                pass


@router.get("/sessions/{session_id}/records")
async def session_records(
    session_id: int, db: DbSession, limit: int = Query(100, ge=1, le=500)
):
    rows = (
        await db.scalars(
            select(UDERecord)
            .where(UDERecord.session_id == session_id)
            .order_by(UDERecord.id)
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "source_url": r.source_url,
            "data": r.data,
            "normalised_data": r.normalised_data,
            "is_valid": r.is_valid,
            "validation_errors": r.validation_errors,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/sessions/{session_id}/records/export")
async def export_records(session_id: int, db: DbSession, format: str = Query("json")):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    rows = (
        await db.scalars(
            select(UDERecord)
            .where(UDERecord.session_id == session_id)
            .order_by(UDERecord.id)
        )
    ).all()

    if format == "csv":
        import csv
        import io
        all_keys: set[str] = set()
        data_rows = []
        for r in rows:
            row = r.normalised_data or r.data or {}
            all_keys.update(row.keys())
            data_rows.append(row)
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=sorted(all_keys), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data_rows)
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="ude-session-{session_id}.csv"'},
        )

    payload = {
        "session": {
            "id": session.id,
            "name": session.name,
            "source_url": session.source_url,
            "source_type_detected": session.source_type_detected,
            "total_records": len(rows),
            "schema": session.schema_detected,
        },
        "records": [r.normalised_data or r.data for r in rows],
    }
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="ude-session-{session_id}.json"'},
    )


@router.get("/sessions/{session_id}/analytics")
async def session_analytics(session_id: int, db: DbSession):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session.analytics_result or {}


@router.post("/sessions/{session_id}/generate-summary")
async def generate_summary(session_id: int, db: DbSession):
    from app.modules.agents.llm import get_provider
    from app.modules.shared.summary import generate_insights_summary

    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "done":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session must be completed first")

    provider = get_provider()
    analytics = dict(session.analytics_result or {})
    records = (session.progress or {}).get("records_collected", analytics.get("total_records", 0))

    try:
        summary_text = await generate_insights_summary(
            session_name=session.name,
            source=session.source_url,
            records=records,
            analytics=analytics,
            provider=provider,
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"Summary generation failed: {exc}"
        ) from exc

    analytics["summary"] = summary_text
    session.analytics_result = analytics
    await db.commit()
    return {"summary": summary_text}


@router.post("/sessions/{session_id}/generate-blog")
async def generate_blog(session_id: int, db: DbSession):
    """Generate a blog post draft from a completed extraction session."""
    from app.models.blog import BlogPost
    from app.modules.agents.llm import get_provider
    from app.modules.universal_extractor.blog_gen import generate_blog_post

    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "done":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session must be completed first")

    provider = get_provider()
    try:
        result = await generate_blog_post(
            session_data={
                "name": session.name,
                "source_url": session.source_url,
                "source_type_detected": session.source_type_detected,
            },
            analytics=dict(session.analytics_result or {}),
            provider=provider,
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Blog generation failed: {exc}") from exc

    # Ensure unique slug
    base_slug = result["slug"]
    slug = base_slug
    counter = 1
    while await db.scalar(select(BlogPost).where(BlogPost.slug == slug)):  # type: ignore[arg-type]
        slug = f"{base_slug}-{counter}"
        counter += 1

    post = BlogPost(
        title=result["title"],
        slug=slug,
        excerpt=result.get("excerpt"),
        content_markdown=result.get("content"),
        status="draft",
        is_featured=False,
        service_key="universal-extractor",
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": post.id, "title": post.title, "slug": post.slug}


@router.get("/sessions/{session_id}/report.pdf")
async def download_pdf_report(session_id: int, db: DbSession):
    """Generate and return a beautiful PDF analytics report for a session."""
    import asyncio

    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "done":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session must be completed first")

    from app.modules.universal_extractor.pdf_report import generate_pdf

    session_data = {
        "name": session.name,
        "source_url": session.source_url,
        "source_type_detected": session.source_type_detected,
        "source_type": session.source_type,
    }
    analytics = dict(session.analytics_result or {})

    loop = asyncio.get_event_loop()
    try:
        pdf_bytes = await loop.run_in_executor(None, generate_pdf, session_data, analytics)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"PDF generation failed: {exc}") from exc

    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in session.name)[:40]
    filename = f"ude-report-{safe_name or session_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Storage stats endpoints (public — view only) ──────────────────────────────

@router.get("/storage/stats")
async def storage_stats(db: DbSession):
    """Return S3 blob count and MongoDB document count for the UDE module."""

    s3_count = 0
    mongodb_count = 0

    try:
        from app.core.storage_s3 import count_blobs, is_configured
        if is_configured():
            s3_count = await count_blobs(prefix="ude/")
    except Exception:
        pass

    try:
        import asyncio

        import pymongo  # type: ignore[import]

        from app.core.config import settings

        url = getattr(settings, "MONGODB_URL", None)
        if url:
            def _count() -> int:
                client = pymongo.MongoClient(url, serverSelectionTimeoutMS=3000)
                db_mongo = client["raybags_ude"]
                cols = db_mongo.list_collection_names()
                total = 0
                for col in cols:
                    if col.startswith("ude_session_"):
                        total += db_mongo[col].count_documents({})
                client.close()
                return total
            mongodb_count = await asyncio.get_event_loop().run_in_executor(None, _count)
    except Exception:
        pass

    pg_sessions = await db.scalar(select(func.count()).select_from(UDESession)) or 0

    return {
        "s3_blob_count": s3_count,
        "mongodb_doc_count": mongodb_count,
        "postgres_session_count": int(pg_sessions),
    }


# ── Admin storage management (requires admin token via header) ────────────────

@router.delete("/admin/storage/s3", status_code=status.HTTP_200_OK)
async def admin_clear_s3(db: DbSession):
    """Delete all UDE blobs from S3. Admin action."""
    try:
        from app.core.storage_s3 import delete_prefix, is_configured
        if not is_configured():
            return {"deleted": 0, "message": "S3 not configured"}
        deleted = await delete_prefix(prefix="ude/")
        # Clear s3 keys from sessions
        sessions = (await db.scalars(select(UDESession).where(UDESession.raw_s3_key.isnot(None)))).all()
        for s in sessions:
            s.raw_s3_key = None
        await db.commit()
        return {"deleted": deleted, "message": f"Deleted {deleted} S3 blobs"}
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


@router.delete("/admin/storage/mongodb", status_code=status.HTTP_200_OK)
async def admin_clear_mongodb(db: DbSession):
    """Drop all UDE collections from MongoDB. Admin action."""
    try:
        import asyncio

        import pymongo  # type: ignore[import]

        from app.core.config import settings

        url = getattr(settings, "MONGODB_URL", None)
        if not url:
            return {"dropped": 0, "message": "MongoDB not configured"}

        def _drop() -> int:
            client = pymongo.MongoClient(url, serverSelectionTimeoutMS=5000)
            db_mongo = client["raybags_ude"]
            cols = db_mongo.list_collection_names()
            dropped = 0
            for col in cols:
                db_mongo.drop_collection(col)
                dropped += 1
            client.close()
            return dropped

        dropped = await asyncio.get_event_loop().run_in_executor(None, _drop)
        sessions = (await db.scalars(select(UDESession).where(UDESession.mongodb_collection.isnot(None)))).all()
        for s in sessions:
            s.mongodb_collection = None
        await db.commit()
        return {"dropped": dropped, "message": f"Dropped {dropped} MongoDB collections"}
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


spec = ModuleSpec(
    key="universal-extractor",
    flag=FLAG,
    router=router,
    prefix="",
    tags=["universal-extractor"],
)
