"""Built-in demo workflow(s) for the agentic engine.

`InsightWorkflow` is a small, real, offline-capable example: it observes a
dataset summary, reasons over it, plans steps, produces an insight via the LLM
provider (stub or OpenAI), and validates the output is non-empty.
"""

from __future__ import annotations

from app.modules.agents.base import AgentWorkflow, StepResult, WorkflowContext
from app.modules.agents.registry import register_workflow


@register_workflow("insight")
class InsightWorkflow(AgentWorkflow):
    name = "Dataset Insight Generator"

    async def reason(self, ctx: WorkflowContext) -> None:
        topic = ctx.input.get("topic", "the provided data")
        ctx.reasoning = await self.provider.complete(
            system="You are a senior data analyst.",
            prompt=f"Outline how to derive insights about {topic}.",
        )

    async def plan(self, ctx: WorkflowContext) -> None:
        ctx.plan = ["profile", "summarize", "recommend"]

    async def execute(self, ctx: WorkflowContext) -> None:
        topic = ctx.input.get("topic", "the dataset")
        points = ctx.input.get("points", [])
        for step in ctx.plan:
            if step == "profile":
                ctx.outputs["profile"] = {"topic": topic, "n_points": len(points)}
            elif step == "summarize":
                ctx.outputs["summary"] = await self.provider.complete(
                    system="You summarise datasets crisply.",
                    prompt=f"Summarise {topic} given {len(points)} data points.",
                )
            elif step == "recommend":
                ctx.outputs["recommendation"] = (
                    f"Track {topic} over time and alert on anomalies."
                )
            ctx.results.append(StepResult(name=step, ok=True, output=ctx.outputs.get(step)))

    async def validate(self, ctx: WorkflowContext) -> bool:
        return bool(ctx.outputs.get("summary"))
