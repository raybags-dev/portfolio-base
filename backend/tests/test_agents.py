"""Agent orchestrator tests — fully offline (stub LLM provider)."""

from app.modules.agents.base import AgentWorkflow, StepResult, WorkflowContext
from app.modules.agents.llm import StubProvider, get_provider
from app.modules.agents.orchestrator import run_workflow


async def test_insight_workflow_runs_and_validates():
    from app.modules.agents.workflows import InsightWorkflow

    wf = InsightWorkflow(StubProvider())
    report = await run_workflow(wf, {"topic": "retail prices", "points": [1, 2, 3]})
    assert report["validated"] is True
    assert report["outputs"]["summary"]
    assert report["attempts"] == 1


async def test_stages_emitted_in_order():
    from app.modules.agents.workflows import InsightWorkflow

    seen: list[str] = []

    async def on_stage(stage, ctx):
        seen.append(stage)

    await run_workflow(InsightWorkflow(StubProvider()), {"topic": "x"}, on_stage=on_stage)
    assert seen[:2] == ["observe", "reason"]
    assert "plan" in seen and "execute" in seen and "validate" in seen
    assert seen[-2:] == ["log", "report"]


async def test_retry_until_max_attempts():
    class FlakyWorkflow(AgentWorkflow):
        name = "Flaky"
        max_attempts = 3

        async def plan(self, ctx: WorkflowContext) -> None:
            ctx.plan = ["try"]

        async def execute(self, ctx: WorkflowContext) -> None:
            ctx.results = [StepResult(name="try", ok=False)]

        async def validate(self, ctx: WorkflowContext) -> bool:
            return False  # never passes

    report = await run_workflow(FlakyWorkflow(StubProvider()), {})
    assert report["validated"] is False
    assert report["attempts"] == 3


async def test_eventual_success_stops_retrying():
    class EventualWorkflow(AgentWorkflow):
        name = "Eventual"
        max_attempts = 5

        async def plan(self, ctx: WorkflowContext) -> None:
            ctx.plan = ["try"]

        async def execute(self, ctx: WorkflowContext) -> None:
            ok = ctx.attempt >= 2
            ctx.results = [StepResult(name="try", ok=ok)]
            ctx.outputs["done"] = ok

        async def validate(self, ctx: WorkflowContext) -> bool:
            return bool(ctx.outputs.get("done"))

    report = await run_workflow(EventualWorkflow(StubProvider()), {})
    assert report["validated"] is True
    assert report["attempts"] == 2


def test_provider_offline_default():
    # With no OPENAI_API_KEY configured in tests, we get the stub provider.
    assert get_provider().name == "stub"
