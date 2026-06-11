"""Hotel Review Analytics API — gated by ENABLE_HOTEL_REVIEWS."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.access import _client_ip, require_app_access
from app.core.deps import DbSession, require_admin, require_flag
from app.models.platform import HotelCrawlRecord, HotelCrawlSession
from app.modules import ModuleSpec
from app.modules.agents.llm import get_provider
from app.modules.hotel_reviews import blog_gen

FLAG = "ENABLE_HOTEL_REVIEWS"

router = APIRouter(
    prefix="/hotel-reviews",
    tags=["hotel-reviews"],
    dependencies=[Depends(require_flag(FLAG))],
)


class SessionCreate(BaseModel):
    name: str
    target_url: str
    collection_prompt: str
    analytics_spec: dict[str, Any] = {}
    max_pages: int = 5
    session_contact: dict[str, Any] | None = None


class SessionPatch(BaseModel):
    analytics_spec: dict[str, Any] | None = None


def _session_dict(s: HotelCrawlSession) -> dict[str, Any]:
    return {
        "id": s.id,
        "name": s.name,
        "target_url": s.target_url,
        "collection_prompt": s.collection_prompt,
        "analytics_spec": s.analytics_spec,
        "max_pages": s.max_pages,
        "status": s.status,
        "progress": s.progress,
        "analytics_result": s.analytics_result,
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
            select(HotelCrawlSession).order_by(HotelCrawlSession.id.desc()).limit(limit)
        )
    ).all()
    return [_session_dict(s) for s in rows]


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate, db: DbSession, request: Request):
    import json as _json
    from app.models.content import Setting

    ip = _client_ip(request)
    is_guest = True
    setting = await db.scalar(select(Setting).where(Setting.key == "dev_mode_ips"))
    if setting:
        try:
            if ip in _json.loads(setting.value or "[]"):
                is_guest = False
        except Exception:
            pass

    session = HotelCrawlSession(
        **payload.model_dump(),
        client_ip=ip,
        is_guest=is_guest,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.get("/guest-sessions", dependencies=[Depends(require_admin())])
async def list_guest_sessions(db: DbSession, limit: int = Query(50, ge=1, le=200)):
    rows = (
        await db.scalars(
            select(HotelCrawlSession)
            .where(HotelCrawlSession.is_guest.is_(True))
            .order_by(HotelCrawlSession.id.desc())
            .limit(limit)
        )
    ).all()
    return [_session_dict(s) for s in rows]


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: DbSession):
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return _session_dict(session)


@router.patch("/sessions/{session_id}")
async def patch_session(session_id: int, payload: SessionPatch, db: DbSession):
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if payload.analytics_spec is not None:
        session.analytics_spec = payload.analytics_spec
    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, db: DbSession) -> Response:
    """Delete a session and all its collected records."""
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    await db.delete(session)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/{session_id}/run", dependencies=[require_app_access("hotel-reviews")])
async def run_session(session_id: int, db: DbSession, background_tasks: BackgroundTasks):
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "Session already running")

    background_tasks.add_task(_run_in_background, session_id)
    return {"message": "Crawl started", "session_id": session_id}


async def _run_in_background(session_id: int) -> None:
    from app.core.database import SessionLocal
    from app.modules.hotel_reviews.service import run_session as _run

    async with SessionLocal() as db:
        try:
            await _run(db, session_id)
        except Exception:
            pass


@router.get("/sessions/{session_id}/records")
async def session_records(
    session_id: int, db: DbSession, limit: int = Query(100, ge=1, le=500)
):
    rows = (
        await db.scalars(
            select(HotelCrawlRecord)
            .where(HotelCrawlRecord.session_id == session_id)
            .order_by(HotelCrawlRecord.id)
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "source_url": r.source_url,
            "data": r.data,
            "is_valid": r.is_valid,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/sessions/{session_id}/records/preview")
async def session_records_preview(session_id: int, db: DbSession):
    """Return first 20 records as raw JSON objects for in-page preview."""
    rows = (
        await db.scalars(
            select(HotelCrawlRecord)
            .where(HotelCrawlRecord.session_id == session_id)
            .order_by(HotelCrawlRecord.id)
            .limit(20)
        )
    ).all()
    return [r.data for r in rows]


@router.get("/sessions/{session_id}/records/export")
async def export_records(session_id: int, db: DbSession):
    """Download all collected records as a JSON file."""
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    rows = (
        await db.scalars(
            select(HotelCrawlRecord)
            .where(HotelCrawlRecord.session_id == session_id)
            .order_by(HotelCrawlRecord.id)
        )
    ).all()

    payload = {
        "session": {
            "id": session.id,
            "name": session.name,
            "target_url": session.target_url,
            "collection_prompt": session.collection_prompt,
            "total_records": len(rows),
        },
        "records": [r.data for r in rows],
    }
    filename = f"crawl-session-{session_id}.json"
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sessions/{session_id}/analytics")
async def session_analytics(session_id: int, db: DbSession):
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session.analytics_result or {}


@router.post("/sessions/{session_id}/generate-blog")
async def generate_blog(session_id: int, db: DbSession):
    """Generate a draft blog post from this session and save it."""
    from app.models.blog import BlogPost

    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "done":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session must be completed first")

    provider = get_provider()
    analytics = session.analytics_result or {}
    session_data = {
        "target_url": session.target_url,
        "collection_prompt": session.collection_prompt,
        "total_records": (session.progress or {}).get("records_collected", 0),
    }

    try:
        draft = await blog_gen.generate_blog_post(session_data, analytics, provider)
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Blog generation failed: {exc}") from exc

    # Ensure slug is unique by always appending session_id
    base_slug = draft.get("slug") or f"crawl-session-{session_id}"
    # Strip invalid chars and append session id for guaranteed uniqueness
    import re
    safe_slug = re.sub(r"[^a-z0-9-]", "-", base_slug.lower())[:60].strip("-")
    unique_slug = f"{safe_slug}-{session_id}"

    post = BlogPost(
        title=draft.get("title", "Untitled Crawl Report"),
        slug=unique_slug,
        content_markdown=draft.get("content", ""),
        excerpt=draft.get("excerpt", ""),
        is_featured=False,
        status="draft",
        service_key="hotel-reviews",
    )
    db.add(post)
    try:
        await db.commit()
    except Exception as db_exc:
        await db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to save blog post — slug conflict or DB error") from db_exc
    await db.refresh(post)

    return {"blog_post_id": post.id, "title": post.title, "slug": post.slug, "draft": True}


spec = ModuleSpec(
    key="hotel-reviews",
    flag=FLAG,
    router=router,
    prefix="",
    tags=["hotel-reviews"],
)
