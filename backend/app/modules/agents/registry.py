"""Registry of runnable agent workflows.

Modules register workflows here by key; the API runs them by name. The crawler
module, for example, registers its self-healing ``crawl`` workflow.
"""

from __future__ import annotations

from collections.abc import Callable

from app.modules.agents.base import AgentWorkflow
from app.modules.agents.llm import LLMProvider

# key -> factory(provider) -> AgentWorkflow
_REGISTRY: dict[str, Callable[[LLMProvider], AgentWorkflow]] = {}


def register_workflow(key: str) -> Callable[[type[AgentWorkflow]], type[AgentWorkflow]]:
    def deco(cls: type[AgentWorkflow]) -> type[AgentWorkflow]:
        cls.key = key
        _REGISTRY[key] = lambda provider: cls(provider)
        return cls

    return deco


def register_factory(key: str, factory: Callable[[LLMProvider], AgentWorkflow]) -> None:
    _REGISTRY[key] = factory


def get_workflow(key: str, provider: LLMProvider) -> AgentWorkflow | None:
    factory = _REGISTRY.get(key)
    return factory(provider) if factory else None


def available_workflows() -> list[str]:
    return sorted(_REGISTRY)
