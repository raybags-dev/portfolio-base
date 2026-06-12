"""News feed API — public GET endpoint + admin trigger."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_flag
from app.modules import ModuleSpec
from app.modules.news import service

FLAG = "ENABLE_NEWS"

router = APIRouter(
    prefix="/news",
    tags=["news"],
)


@router.get("/feed")
async def get_feed(
    db: DbSession,
    limit: int = Query(default=60, ge=1, le=200),
    source: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    """Public news feed — latest extracted headlines."""
    return await service.get_feed(db, limit=limit, source=source)


@router.post("/extract", dependencies=[Depends(require_flag(FLAG))])
async def trigger_extract(db: DbSession) -> dict[str, Any]:
    """Manually trigger a CNN extraction (admin convenience)."""
    return await service.extract_and_store(db)


spec = ModuleSpec(key="news", flag=FLAG, router=router, prefix="", tags=["news"])
