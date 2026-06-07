"""Agent service — runs workflows and persists progress to `agent_tasks`."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

# Importing workflows registers the built-ins.
import app.modules.agents.workflows  # noqa: F401
from app.core.logging import get_logger
from app.models.platform import AgentTask
from app.modules.agents.base import WorkflowContext
from app.modules.agents.llm import get_provider
from app.modules.agents.orchestrator import run_workflow
from app.modules.agents.registry import get_workflow

log = get_logger("agents.service")


class AgentService:
    @staticmethod
    async def run(
        db: AsyncSession,
        workflow_key: str,
        input: dict[str, Any],
        *,
        title: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        provider = get_provider(model)
        workflow = get_workflow(workflow_key, provider)
        if workflow is None:
            raise ValueError(f"Unknown workflow: {workflow_key}")

        task = AgentTask(
            title=title or f"{workflow.name} run",
            input=input,
            status="running",
            stage="observe",
            attempts=0,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)

        async def on_stage(stage: str, ctx: WorkflowContext) -> None:
            task.stage = stage
            task.attempts = ctx.attempt
            await db.commit()

        try:
            report = await run_workflow(workflow, input, on_stage=on_stage)
            task.output = report
            task.plan = {"steps": report.get("plan", [])}
            task.status = "done" if report.get("validated") else "failed"
            task.stage = "report"
            if not report.get("validated"):
                task.error = report.get("error") or "validation failed"
        except Exception as exc:
            task.status = "failed"
            task.error = str(exc)
            report = {"workflow": workflow_key, "validated": False, "error": str(exc)}
            log.warning("agent.run.failed", workflow=workflow_key, error=str(exc))
        finally:
            await db.commit()
            await db.refresh(task)

        return {"task_id": task.id, "provider": provider.name, **report}
