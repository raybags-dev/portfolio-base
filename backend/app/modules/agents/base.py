"""Workflow context + abstract agent workflow."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.modules.agents.llm import LLMProvider

# Canonical agent stages, in order.
STAGES = ["observe", "reason", "plan", "execute", "validate", "retry", "log", "report"]


@dataclass
class StepResult:
    name: str
    ok: bool
    output: Any = None
    error: str | None = None


@dataclass
class WorkflowContext:
    input: dict[str, Any]
    observations: dict[str, Any] = field(default_factory=dict)
    reasoning: str = ""
    plan: list[str] = field(default_factory=list)
    results: list[StepResult] = field(default_factory=list)
    outputs: dict[str, Any] = field(default_factory=dict)
    attempt: int = 0
    stage: str = "observe"
    logs: list[dict[str, Any]] = field(default_factory=list)

    def log(self, stage: str, message: str, **extra: Any) -> None:
        self.logs.append({"stage": stage, "message": message, **extra})


class AgentWorkflow(ABC):
    """A unit of agentic work. Subclasses implement the cognitive stages.

    The orchestrator drives them; subclasses stay focused on domain logic.
    """

    key: str = "workflow"
    name: str = "Workflow"
    max_attempts: int = 3

    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider

    async def observe(self, ctx: WorkflowContext) -> None:
        """Gather inputs/context. Default: copy input into observations."""
        ctx.observations.update(ctx.input)

    async def reason(self, ctx: WorkflowContext) -> None:
        """Decide an approach. Default: a one-line note."""
        ctx.reasoning = f"Proceed with {self.name}."

    @abstractmethod
    async def plan(self, ctx: WorkflowContext) -> None:
        """Fill ``ctx.plan`` with ordered step names."""

    @abstractmethod
    async def execute(self, ctx: WorkflowContext) -> None:
        """Run the plan, appending to ``ctx.results`` / ``ctx.outputs``."""

    @abstractmethod
    async def validate(self, ctx: WorkflowContext) -> bool:
        """Return True if outputs are acceptable; False triggers a retry."""

    async def report(self, ctx: WorkflowContext) -> dict[str, Any]:
        """Summarise the run."""
        return {
            "workflow": self.key,
            "attempts": ctx.attempt,
            "ok": all(r.ok for r in ctx.results) if ctx.results else False,
            "outputs": ctx.outputs,
            "plan": ctx.plan,
            "reasoning": ctx.reasoning,
        }
