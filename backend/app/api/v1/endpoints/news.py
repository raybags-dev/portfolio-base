"""News feed endpoint — returns items from news_items table."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.core.deps import DbSession

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/feed")
async def news_feed(db: DbSession, limit: int = 60, source: str | None = None) -> list[dict]:
    """Return recent news items. Returns empty list if table has no rows."""
    try:
        q = "SELECT id, title, url, category, source FROM news_items ORDER BY id DESC LIMIT :limit"
        rows = (await db.execute(text(q), {"limit": limit})).fetchall()
        items = [{"id": r[0], "title": r[1], "url": r[2], "category": r[3], "source": r[4]} for r in rows]
        if source:
            items = [i for i in items if i["source"] == source]
        return items
    except Exception:
        return []
