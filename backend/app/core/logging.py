"""Structured logging via structlog.

JSON logs in production (machine-parseable, ready for Loki/ELK), pretty
console logs locally. Call ``configure_logging()`` once at startup.
"""

from __future__ import annotations

import logging
import sys
import threading
from collections import deque

import structlog

from app.core.config import settings


class LogBuffer:
    """Thread-safe circular buffer for recent structlog events (admin log viewer)."""

    def __init__(self, maxlen: int = 500) -> None:
        self._buf: deque[dict] = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def append(self, event: dict) -> None:
        with self._lock:
            self._buf.append(event.copy())

    def recent(self, limit: int = 100, level: str | None = None) -> list[dict]:
        with self._lock:
            entries = list(self._buf)
        if level:
            lv = level.lower()
            entries = [e for e in entries if str(e.get("level", "")).lower() == lv]
        return entries[-limit:]


log_buffer = LogBuffer()


def _buffer_capture(logger, method, event_dict):
    """Structlog processor: snapshot event into the in-memory buffer."""
    log_buffer.append(event_dict)
    return event_dict


def configure_logging() -> None:
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    # Quiet chatty third-party debug loggers even when we run at DEBUG.
    for noisy in ("aiosqlite", "asyncio", "sqlalchemy.engine.Engine", "multipart"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.is_production:
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[*shared_processors, _buffer_capture, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
