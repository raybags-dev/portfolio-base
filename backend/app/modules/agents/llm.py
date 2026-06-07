"""LLM provider abstraction.

The platform never hard-depends on a specific model vendor or on network
access. `StubProvider` gives deterministic, offline answers so workflows (and
tests) run without an API key; `OpenAIProvider` is used automatically when
`OPENAI_API_KEY` is set and the `openai` package is installed.
"""

from __future__ import annotations

import json
from typing import Any, Protocol, runtime_checkable

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("agents.llm")


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    async def complete(self, system: str, prompt: str) -> str: ...

    async def propose_json(
        self, system: str, prompt: str, *, fallback: dict[str, Any] | None = None
    ) -> dict[str, Any]: ...


class StubProvider:
    """Deterministic, dependency-free provider.

    Returns structured, rule-based responses. It is intentionally simple but
    *useful*: callers pass a `fallback` for JSON requests so a real, working
    decision is always available offline (e.g. heuristic selector recovery).
    """

    name = "stub"

    async def complete(self, system: str, prompt: str) -> str:
        return (
            "[stub-llm] Offline reasoning. Configure OPENAI_API_KEY for live "
            "model output. Prompt summary: " + prompt[:160]
        )

    async def propose_json(
        self, system: str, prompt: str, *, fallback: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return dict(fallback or {})


class OpenAIProvider:
    """Thin wrapper over the OpenAI SDK (lazy-imported)."""

    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        from openai import AsyncOpenAI  # lazy: optional dependency

        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def complete(self, system: str, prompt: str) -> str:
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""

    async def propose_json(
        self, system: str, prompt: str, *, fallback: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        try:
            resp = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system + " Respond ONLY with JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content or "{}")
        except Exception as exc:  # network/parse/quota — degrade gracefully
            log.warning("openai.propose_json.failed", error=str(exc))
            return dict(fallback or {})


def get_provider(model: str | None = None) -> LLMProvider:
    """Pick the best available provider for the current environment."""
    if settings.OPENAI_API_KEY:
        try:
            return OpenAIProvider(settings.OPENAI_API_KEY, model or "gpt-4o-mini")
        except Exception as exc:  # openai not installed, etc.
            log.warning("openai.init.failed", error=str(exc))
    return StubProvider()
