"""Stream pipeline service — topic management, event publishing, alert evaluation."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import AlertFired, AlertRule, StreamEvent, StreamTopic
from app.modules.streams.pipeline import bus, kafka, redis_publish

log = get_logger("streams.service")

_KEEP_EVENTS = 500   # max events retained per topic in the DB


# ── Topic helpers ──────────────────────────────────────────────────────────────

async def ensure_topic(
    db: AsyncSession,
    name: str,
    description: str | None = None,
    source_key: str | None = None,
) -> StreamTopic:
    topic = await db.scalar(select(StreamTopic).where(StreamTopic.name == name))
    if topic is None:
        topic = StreamTopic(name=name, description=description, source_key=source_key)
        db.add(topic)
        await db.flush()
    return topic


async def list_topics(db: AsyncSession) -> list[dict]:
    rows = (await db.scalars(select(StreamTopic).order_by(StreamTopic.name))).all()
    return [
        {
            "name": t.name,
            "description": t.description,
            "source_key": t.source_key,
            "event_count": t.event_count,
            "last_event_at": t.last_event_at.isoformat() if t.last_event_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in rows
    ]


async def delete_topic(db: AsyncSession, name: str) -> None:
    topic = await db.scalar(select(StreamTopic).where(StreamTopic.name == name))
    if topic:
        await db.delete(topic)
        await db.commit()


# ── Publishing ─────────────────────────────────────────────────────────────────

async def publish(
    db: AsyncSession,
    topic_name: str,
    payload: dict[str, Any],
    *,
    source_key: str | None = None,
) -> None:
    """Publish one event: persist → SSE broadcast → Kafka → alert check."""
    now = datetime.now(tz=UTC)

    topic = await ensure_topic(db, topic_name, source_key=source_key)
    topic.event_count = (topic.event_count or 0) + 1
    topic.last_event_at = now

    event_row = StreamEvent(topic_name=topic_name, payload=payload)
    db.add(event_row)
    await db.commit()
    await db.refresh(event_row)

    envelope = {
        "id": event_row.id,
        "topic": topic_name,
        "payload": payload,
        "ts": now.isoformat(),
    }

    # Fan out to SSE subscribers (in-process)
    await bus.publish(envelope)

    # Cross-worker fan-out via Redis pub/sub
    await redis_publish(envelope)

    # Bridge to Kafka if configured
    await kafka.produce(topic_name, envelope)

    # Prune oldest events beyond the keep-limit (fire-and-forget)
    await _prune(db, topic_name)

    # Evaluate alert rules
    await _check_alerts(db, topic_name, payload, envelope)

    log.info("streams.event.published", topic=topic_name, event_id=event_row.id)


async def publish_batch(
    db: AsyncSession,
    topic_name: str,
    records: list[dict[str, Any]],
    *,
    source_key: str | None = None,
) -> int:
    """Publish many records to the same topic. Returns count published."""
    published = 0
    for record in records:
        try:
            await publish(db, topic_name, record, source_key=source_key)
            published += 1
        except Exception as exc:
            log.warning("streams.batch.skip", error=str(exc))
    return published


async def _prune(db: AsyncSession, topic_name: str) -> None:
    subq = (
        select(StreamEvent.id)
        .where(StreamEvent.topic_name == topic_name)
        .order_by(StreamEvent.id.desc())
        .limit(_KEEP_EVENTS)
        .subquery()
    )
    await db.execute(
        delete(StreamEvent).where(
            StreamEvent.topic_name == topic_name,
            StreamEvent.id.not_in(select(subq.c.id)),
        )
    )
    await db.commit()


# ── Events ─────────────────────────────────────────────────────────────────────

async def get_events(
    db: AsyncSession,
    topic_name: str,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    rows = (
        await db.scalars(
            select(StreamEvent)
            .where(StreamEvent.topic_name == topic_name)
            .order_by(StreamEvent.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        {
            "id": e.id,
            "topic": e.topic_name,
            "payload": e.payload,
            "ts": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]


async def get_recent_events(db: AsyncSession, limit: int = 50) -> list[dict]:
    """Recent events across ALL topics, oldest-first (for SSE history replay)."""
    rows = (
        await db.scalars(
            select(StreamEvent)
            .order_by(StreamEvent.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": e.id,
            "topic": e.topic_name,
            "payload": e.payload,
            "ts": e.created_at.isoformat() if e.created_at else None,
        }
        for e in reversed(rows)
    ]


async def get_stats(db: AsyncSession) -> dict:
    total_topics = await db.scalar(select(func.count()).select_from(StreamTopic)) or 0
    total_events = await db.scalar(select(func.count()).select_from(StreamEvent)) or 0
    active_rules = (
        await db.scalar(
            select(func.count()).select_from(AlertRule).where(AlertRule.enabled.is_(True))
        )
        or 0
    )
    recent_fired = (
        await db.scalar(select(func.count()).select_from(AlertFired)) or 0
    )
    return {
        "total_topics": total_topics,
        "total_events": total_events,
        "active_rules": active_rules,
        "alerts_fired": recent_fired,
        "kafka_available": kafka.available,
    }


# ── Alert rules ────────────────────────────────────────────────────────────────

async def list_rules(db: AsyncSession, topic_name: str | None = None) -> list[dict]:
    q = select(AlertRule).order_by(AlertRule.id.desc())
    if topic_name:
        q = q.where(AlertRule.topic_name == topic_name)
    rows = (await db.scalars(q)).all()
    return [
        {
            "id": r.id,
            "topic_name": r.topic_name,
            "label": r.label,
            "field_path": r.field_path,
            "operator": r.operator,
            "threshold": r.threshold,
            "enabled": r.enabled,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


async def create_rule(db: AsyncSession, data: dict) -> dict:
    await ensure_topic(db, data["topic_name"])
    rule = AlertRule(
        topic_name=data["topic_name"],
        label=data["label"],
        field_path=data["field_path"],
        operator=data["operator"],
        threshold=str(data["threshold"]),
        enabled=data.get("enabled", True),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": rule.id, "label": rule.label}


async def delete_rule(db: AsyncSession, rule_id: int) -> None:
    rule = await db.get(AlertRule, rule_id)
    if rule:
        await db.delete(rule)
        await db.commit()


async def list_fired(db: AsyncSession, limit: int = 50) -> list[dict]:
    rows = (
        await db.scalars(
            select(AlertFired)
            .order_by(AlertFired.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": f.id,
            "rule_id": f.rule_id,
            "event_snapshot": f.event_snapshot,
            "fired_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in rows
    ]


def _get_field(payload: dict, path: str) -> Any:
    """Dot-notation field accessor: 'price.amount' → payload['price']['amount']."""
    parts = path.split(".")
    val: Any = payload
    for p in parts:
        if isinstance(val, dict):
            val = val.get(p)
        else:
            return None
    return val


_OPS = {
    "lt":       lambda a, b: float(a) < float(b),
    "gt":       lambda a, b: float(a) > float(b),
    "eq":       lambda a, b: str(a) == str(b),
    "ne":       lambda a, b: str(a) != str(b),
    "contains": lambda a, b: str(b).lower() in str(a).lower(),
}


async def _check_alerts(
    db: AsyncSession,
    topic_name: str,
    payload: dict,
    envelope: dict,
) -> None:
    rules = (
        await db.scalars(
            select(AlertRule).where(
                AlertRule.topic_name == topic_name,
                AlertRule.enabled.is_(True),
            )
        )
    ).all()

    for rule in rules:
        fn = _OPS.get(rule.operator)
        if not fn:
            continue
        val = _get_field(payload, rule.field_path)
        if val is None:
            continue
        try:
            fired = fn(val, rule.threshold)
        except (ValueError, TypeError):
            continue
        if fired:
            db.add(AlertFired(rule_id=rule.id, event_snapshot=envelope))
            # Also broadcast the alert over the bus
            await bus.publish({
                "topic": "_alerts",
                "rule_id": rule.id,
                "label": rule.label,
                "field": rule.field_path,
                "value": str(val),
                "threshold": rule.threshold,
                "operator": rule.operator,
                "event": envelope,
            })
            log.info("streams.alert.fired", rule=rule.label, value=val)

    await db.commit()
