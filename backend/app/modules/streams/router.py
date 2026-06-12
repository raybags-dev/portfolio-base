"""Stream Pipeline API.

Endpoints:
  GET  /streams/stats                  — pipeline health & counts
  GET  /streams/topics                 — list all topics
  POST /streams/topics                 — create / ensure a topic
  DEL  /streams/topics/{name}          — delete topic + all events
  GET  /streams/topics/{name}/events   — paginated events for a topic
  POST /streams/publish                — publish one event (test / manual)
  GET  /streams/sse                    — Server-Sent Events live feed
  GET  /streams/alerts                 — list alert rules
  POST /streams/alerts                 — create alert rule
  DEL  /streams/alerts/{id}            — delete alert rule
  GET  /streams/alerts/fired           — recent alert firings
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.deps import DbSession, require_flag
from app.modules import ModuleSpec
from app.modules.streams import service
from app.modules.streams.pipeline import bus

FLAG = "ENABLE_STREAM_PIPELINE"

router = APIRouter(prefix="/streams", tags=["streams"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TopicIn(BaseModel):
    name: str
    description: str | None = None
    source_key: str | None = None


class PublishIn(BaseModel):
    topic: str
    payload: dict[str, Any]


class AlertRuleIn(BaseModel):
    topic_name: str
    label: str
    field_path: str
    operator: str   # lt | gt | eq | ne | contains
    threshold: str
    enabled: bool = True


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(db: DbSession) -> dict:
    return await service.get_stats(db)


# ── Topics ────────────────────────────────────────────────────────────────────

@router.get("/topics")
async def list_topics(db: DbSession) -> list[dict]:
    return await service.list_topics(db)


@router.post("/topics", dependencies=[Depends(require_flag(FLAG))])
async def create_topic(body: TopicIn, db: DbSession) -> dict:
    t = await service.ensure_topic(db, body.name, body.description, body.source_key)
    await db.commit()
    return {"name": t.name, "created": True}


@router.delete("/topics/{name}", dependencies=[Depends(require_flag(FLAG))])
async def delete_topic(name: str, db: DbSession) -> dict:
    await service.delete_topic(db, name)
    return {"deleted": name}


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/topics/{name}/events")
async def get_events(
    name: str,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    return await service.get_events(db, name, limit=limit, offset=offset)


# ── Publish (manual / test) ───────────────────────────────────────────────────

@router.post("/publish", dependencies=[Depends(require_flag(FLAG))])
async def publish_event(body: PublishIn, db: DbSession) -> dict:
    await service.publish(db, body.topic, body.payload)
    return {"published": True, "topic": body.topic}


# ── SSE live feed ─────────────────────────────────────────────────────────────

@router.get("/sse")
async def sse_stream(
    topic: str | None = Query(default=None, description="Filter to one topic. Omit for all."),
) -> StreamingResponse:
    """Server-Sent Events stream.  Connect with EventSource('/api/v1/streams/sse')."""

    async def _generator():
        # Send buffered recent events so the client isn't blank on connect
        for ev in bus.history(topic=topic, limit=20):
            yield f"data: {json.dumps(ev, default=str)}\n\n"
        # Then stream live events
        async for ev in bus.subscribe(topic=topic):
            yield f"data: {json.dumps(ev, default=str)}\n\n"

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # prevent nginx from buffering SSE
            "Connection": "keep-alive",
        },
    )


# ── Alert rules ───────────────────────────────────────────────────────────────

@router.get("/alerts")
async def list_rules(
    db: DbSession,
    topic: str | None = Query(default=None),
) -> list[dict]:
    return await service.list_rules(db, topic_name=topic)


@router.post("/alerts", dependencies=[Depends(require_flag(FLAG))])
async def create_rule(body: AlertRuleIn, db: DbSession) -> dict:
    VALID_OPS = {"lt", "gt", "eq", "ne", "contains"}
    if body.operator not in VALID_OPS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"operator must be one of {VALID_OPS}")
    return await service.create_rule(db, body.model_dump())


@router.delete("/alerts/{rule_id}", dependencies=[Depends(require_flag(FLAG))])
async def delete_rule(rule_id: int, db: DbSession) -> dict:
    await service.delete_rule(db, rule_id)
    return {"deleted": rule_id}


@router.get("/alerts/fired")
async def fired_alerts(
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict]:
    return await service.list_fired(db, limit=limit)


# ── Module spec ───────────────────────────────────────────────────────────────

spec = ModuleSpec(
    key="stream-pipeline",
    flag=FLAG,
    router=router,
    prefix="",
    tags=["streams"],
)
