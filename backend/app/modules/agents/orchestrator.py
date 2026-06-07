"""The orchestration loop.

Drives a workflow through the canonical stages with bounded retries, emitting
stage transitions to an optional async callback (used to persist `AgentTask`
progress). DB-agnostic so it is trivially testable offline.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.core.logging import get_logger
from app.modules.agents.base import AgentWorkflow, WorkflowContext

log = get_logger("agents.orchestrator")

# called as: await on_stage(stage, ctx)
StageHook = Callable[[str, WorkflowContext], Awaitable[None]]


async def run_workflow(
    workflow: AgentWorkflow,
    input: dict[str, Any],
    *,
    on_stage: StageHook | None = None,
) -> dict[str, Any]:
    ctx = WorkflowContext(input=input)

    async def enter(stage: str) -> None:
        ctx.stage = stage
        ctx.log(stage, f"enter {stage}")
        log.info("agent.stage", workflow=workflow.key, stage=stage, attempt=ctx.attempt)
        if on_stage:
            await on_stage(stage, ctx)

    # observe → reason (once)
    await enter("observe")
    await workflow.observe(ctx)
    await enter("reason")
    await workflow.reason(ctx)

    validated = False
    last_error: str | None = None

    # plan → execute → validate, retrying up to max_attempts
    while ctx.attempt < workflow.max_attempts and not validated:
        ctx.attempt += 1
        try:
            await enter("plan")
            await workflow.plan(ctx)

            await enter("execute")
            await workflow.execute(ctx)

            await enter("validate")
            validated = await workflow.validate(ctx)

            if not validated and ctx.attempt < workflow.max_attempts:
                await enter("retry")
                ctx.log("retry", f"validation failed; retrying (attempt {ctx.attempt})")
        except Exception as exc:  # a stage blew up — record and maybe retry
            last_error = str(exc)
            ctx.log("execute", "exception", error=last_error)
            log.warning("agent.exception", workflow=workflow.key, error=last_error)
            if ctx.attempt < workflow.max_attempts:
                await enter("retry")

    await enter("log")
    await enter("report")
    report = await workflow.report(ctx)
    report["validated"] = validated
    if last_error and not validated:
        report["error"] = last_error
    return report
