"""Agentic AI API — gated by ENABLE_AGENTIC_AI."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession, require_admin, require_flag
from app.models.platform import AgentTask
from app.modules import ModuleSpec
from app.modules.agents.registry import available_workflows
from app.modules.agents.service import AgentService

FLAG = "ENABLE_AGENTIC_AI"

router = APIRouter(
    prefix="/agents",
    tags=["agents"],
    dependencies=[Depends(require_flag(FLAG))],
)


class RunRequest(BaseModel):
    workflow: str
    input: dict[str, Any] = {}
    title: str | None = None
    model: str | None = None


@router.get("/workflows", response_model=list[str])
async def list_workflows() -> list[str]:
    return available_workflows()


@router.post("/run", dependencies=[Depends(require_admin())])
async def run_workflow_endpoint(payload: RunRequest, db: DbSession) -> dict[str, Any]:
    try:
        return await AgentService.run(
            db, payload.workflow, payload.input, title=payload.title, model=payload.model
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.get("/tasks", dependencies=[Depends(require_admin())])
async def list_tasks(
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
):
    rows = (
        await db.scalars(select(AgentTask).order_by(AgentTask.id.desc()).limit(limit))
    ).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "stage": t.stage,
            "attempts": t.attempts,
            "error": t.error,
            "created_at": t.created_at,
        }
        for t in rows
    ]


@router.get("/tasks/{task_id}", dependencies=[Depends(require_admin())])
async def get_task(task_id: int, db: DbSession) -> dict[str, Any]:
    t = await db.get(AgentTask, task_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return {
        "id": t.id,
        "title": t.title,
        "status": t.status,
        "stage": t.stage,
        "attempts": t.attempts,
        "input": t.input,
        "plan": t.plan,
        "output": t.output,
        "error": t.error,
    }


spec = ModuleSpec(
    key="agents",
    flag=FLAG,
    router=router,
    prefix="",
    tags=["agents"],
)
