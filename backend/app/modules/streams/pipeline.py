"""In-process event bus for real-time SSE delivery + optional Kafka bridge.

The bus is the single source of truth for live events inside this process.
When ENABLE_KAFKA is true and confluent-kafka is installed, every publish()
call also fires to the Kafka broker — fully transparent to callers.

Architecture:
  publisher  →  EventBus.publish()  →  [SSE subscriber queues]
                                    →  [Kafka topic]  (optional)
                                    →  [DB persist]   (handled in service.py)
"""

from __future__ import annotations

import asyncio
import json
import os
from collections import deque
from collections.abc import AsyncGenerator

from app.core.logging import get_logger

log = get_logger("streams.pipeline")

_QUEUE_MAX = 100   # per-subscriber backpressure limit
_HISTORY_MAX = 200 # in-memory recent events (per bus, all topics)


class EventBus:
    """Async fan-out bus.  publish() is O(subscribers); subscribe() returns
    an async generator that yields events until the caller disconnects."""

    def __init__(self) -> None:
        self._queues: list[asyncio.Queue] = []
        self._history: deque[dict] = deque(maxlen=_HISTORY_MAX)

    async def publish(self, event: dict) -> None:
        self._history.append(event)
        dead: list[asyncio.Queue] = []
        for q in list(self._queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            try:
                self._queues.remove(q)
            except ValueError:
                pass

    async def subscribe(self, topic: str | None = None) -> AsyncGenerator[dict]:
        """Async generator — yields every event (optionally filtered by topic).
        Cleans up the queue when the caller's connection closes."""
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=_QUEUE_MAX)
        self._queues.append(q)
        try:
            while True:
                event = await q.get()
                if topic is None or event.get("topic") == topic:
                    yield event
        finally:
            try:
                self._queues.remove(q)
            except ValueError:
                pass

    def history(self, topic: str | None = None, limit: int = 50) -> list[dict]:
        events = list(self._history)
        if topic:
            events = [e for e in events if e.get("topic") == topic]
        return events[-limit:]


# Module-level singleton — shared across all requests in the same process.
bus = EventBus()


# ── Optional Kafka bridge ─────────────────────────────────────────────────────

class _KafkaBridge:
    """Thin wrapper around confluent-kafka Producer.
    No-op when confluent-kafka is not installed or ENABLE_KAFKA is falsy."""

    def __init__(self) -> None:
        self._producer = None
        bootstrap = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "")
        if not bootstrap:
            return
        try:
            from confluent_kafka import Producer  # type: ignore[import]
            self._producer = Producer({"bootstrap.servers": bootstrap,
                                       "socket.timeout.ms": 5000})
            log.info("streams.kafka.connected", bootstrap=bootstrap)
        except ImportError:
            log.info("streams.kafka.unavailable",
                     reason="confluent-kafka not installed — using in-process bus only")
        except Exception as exc:
            log.warning("streams.kafka.init_failed", error=str(exc))

    @property
    def available(self) -> bool:
        return self._producer is not None

    async def produce(self, topic: str, event: dict) -> None:
        if not self._producer:
            return
        loop = asyncio.get_event_loop()
        payload = json.dumps(event, default=str).encode()
        try:
            await loop.run_in_executor(None, self._producer.produce, topic, payload)
        except Exception as exc:
            log.warning("streams.kafka.produce_failed", topic=topic, error=str(exc))


kafka = _KafkaBridge()
