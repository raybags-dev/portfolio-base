"""Hotel Review Analytics API — gated by ENABLE_HOTEL_REVIEWS."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.access import require_app_access
from app.core.deps import DbSession, require_flag
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
async def create_session(payload: SessionCreate, db: DbSession):
    session = HotelCrawlSession(**payload.model_dump())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: DbSession):
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return _session_dict(session)


@router.post("/sessions/{session_id}/run", dependencies=[require_app_access("hotel-reviews")])
async def run_session(session_id: int, db: DbSession, background_tasks: BackgroundTasks):

    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "Session already running")

    # Run in background so the endpoint returns immediately
    background_tasks.add_task(_run_in_background, session_id)
    return {"message": "Crawl started", "session_id": session_id}


async def _run_in_background(session_id: int) -> None:
    from app.core.database import SessionLocal
    from app.modules.hotel_reviews.service import run_session as _run

    async with SessionLocal() as db:
        try:
            await _run(db, session_id)
        except Exception:
            pass  # errors already persisted to session.error


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
            "validation_errors": r.validation_errors,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/sessions/{session_id}/analytics")
async def session_analytics(session_id: int, db: DbSession):
    session = await db.get(HotelCrawlSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session.analytics_result or {}


@router.post("/sessions/{session_id}/generate-blog")
async def generate_blog(session_id: int, db: DbSession):
    """Generate a draft blog post from this session and save it."""
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

    draft = await blog_gen.generate_blog_post(session_data, analytics, provider)

    # Save as a draft blog post (status="draft" is the default)
    from app.models.blog import BlogPost

    post = BlogPost(
        title=draft.get("title", "Untitled"),
        slug=draft.get("slug", f"crawl-session-{session_id}"),
        content_markdown=draft.get("content", ""),
        excerpt=draft.get("excerpt", ""),
        is_featured=False,
        status="draft",
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    return {"blog_post_id": post.id, "title": post.title, "slug": post.slug, "draft": True}


spec = ModuleSpec(
    key="hotel-reviews",
    flag=FLAG,
    router=router,
    prefix="",
    tags=["hotel-reviews"],
)
