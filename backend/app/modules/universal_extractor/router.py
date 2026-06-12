"""Universal Data Extractor API — gated by ENABLE_UNIVERSAL_EXTRACTOR."""

from __future__ import annotations

import json
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from pydantic import BaseModel
from sqlalchemy import select

from app.core.access import _client_ip, require_app_access
from app.core.deps import DbSession, require_flag
from app.models.content import Setting
from app.models.platform import UDERecord, UDESession
from app.modules import ModuleSpec

FLAG = "ENABLE_UNIVERSAL_EXTRACTOR"

router = APIRouter(
    prefix="/universal-extractor",
    tags=["universal-extractor"],
    dependencies=[Depends(require_flag(FLAG))],
)


class SessionCreate(BaseModel):
    name: str
    source_url: str
    source_type: str = "auto"          # auto|html|api|csv|json|xml|kaggle|text
    extraction_prompt: str = "Extract all structured data from this source."
    source_config: dict[str, Any] = {}  # headers, max_pages, auth, etc.
    analytics_spec: dict[str, Any] = {}
    max_records: int = 1000
    session_contact: dict[str, Any] | None = None


class SessionPatch(BaseModel):
    analytics_spec: dict[str, Any] | None = None
    extraction_prompt: str | None = None


def _session_dict(s: UDESession) -> dict[str, Any]:
    return {
        "id": s.id,
        "name": s.name,
        "source_url": s.source_url,
        "source_type": s.source_type,
        "source_type_detected": s.source_type_detected,
        "extraction_prompt": s.extraction_prompt,
        "source_config": s.source_config,
        "analytics_spec": s.analytics_spec,
        "max_records": s.max_records,
        "status": s.status,
        "progress": s.progress,
        "analytics_result": s.analytics_result,
        "schema_detected": s.schema_detected,
        "error": s.error,
        "created_at": s.created_at,
        "client_ip": s.client_ip,
        "is_guest": s.is_guest,
        "session_contact": s.session_contact,
    }


@router.get("/sessions")
async def list_sessions(db: DbSession, limit: int = Query(20, ge=1, le=100)):
    rows = (
        await db.scalars(
            select(UDESession).order_by(UDESession.id.desc()).limit(limit)
        )
    ).all()
    return [_session_dict(s) for s in rows]


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate, db: DbSession, request: Request):
    ip = _client_ip(request)
    is_guest = True
    setting = await db.scalar(select(Setting).where(Setting.key == "dev_mode_ips"))
    if setting:
        try:
            if ip in json.loads(setting.value or "[]"):
                is_guest = False
        except Exception:
            pass

    session = UDESession(
        **payload.model_dump(),
        client_ip=ip,
        is_guest=is_guest,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: DbSession):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return _session_dict(session)


@router.patch("/sessions/{session_id}")
async def patch_session(session_id: int, payload: SessionPatch, db: DbSession):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if payload.analytics_spec is not None:
        session.analytics_spec = payload.analytics_spec
    if payload.extraction_prompt is not None:
        session.extraction_prompt = payload.extraction_prompt
    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, db: DbSession) -> Response:
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    await db.delete(session)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sessions/{session_id}/run", dependencies=[require_app_access("universal-extractor")])
async def run_session(session_id: int, db: DbSession, background_tasks: BackgroundTasks):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "Session already running")
    background_tasks.add_task(_run_in_background, session_id)
    return {"message": "Extraction started", "session_id": session_id}


async def _run_in_background(session_id: int) -> None:
    from app.core.database import SessionLocal
    from app.modules.universal_extractor.service import run_session as _run

    async with SessionLocal() as db:
        try:
            await _run(db, session_id)
        except Exception:
            pass


@router.get("/sessions/{session_id}/records")
async def session_records(
    session_id: int, db: DbSession, limit: int = Query(100, ge=1, le=500)
):
    rows = (
        await db.scalars(
            select(UDERecord)
            .where(UDERecord.session_id == session_id)
            .order_by(UDERecord.id)
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "source_url": r.source_url,
            "data": r.data,
            "normalised_data": r.normalised_data,
            "is_valid": r.is_valid,
            "validation_errors": r.validation_errors,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/sessions/{session_id}/records/export")
async def export_records(session_id: int, db: DbSession, format: str = Query("json")):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    rows = (
        await db.scalars(
            select(UDERecord)
            .where(UDERecord.session_id == session_id)
            .order_by(UDERecord.id)
        )
    ).all()

    if format == "csv":
        import csv
        import io
        all_keys: set[str] = set()
        data_rows = []
        for r in rows:
            row = r.normalised_data or r.data or {}
            all_keys.update(row.keys())
            data_rows.append(row)
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=sorted(all_keys), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data_rows)
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="ude-session-{session_id}.csv"'},
        )

    payload = {
        "session": {
            "id": session.id,
            "name": session.name,
            "source_url": session.source_url,
            "source_type_detected": session.source_type_detected,
            "total_records": len(rows),
            "schema": session.schema_detected,
        },
        "records": [r.normalised_data or r.data for r in rows],
    }
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="ude-session-{session_id}.json"'},
    )


@router.get("/sessions/{session_id}/analytics")
async def session_analytics(session_id: int, db: DbSession):
    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session.analytics_result or {}


@router.post("/sessions/{session_id}/generate-summary")
async def generate_summary(session_id: int, db: DbSession):
    from app.modules.agents.llm import get_provider
    from app.modules.shared.summary import generate_insights_summary

    session = await db.get(UDESession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.status != "done":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session must be completed first")

    provider = get_provider()
    analytics = dict(session.analytics_result or {})
    records = (session.progress or {}).get("records_collected", analytics.get("total_records", 0))

    try:
        summary_text = await generate_insights_summary(
            session_name=session.name,
            source=session.source_url,
            records=records,
            analytics=analytics,
            provider=provider,
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"Summary generation failed: {exc}"
        ) from exc

    analytics["summary"] = summary_text
    session.analytics_result = analytics
    await db.commit()
    return {"summary": summary_text}


spec = ModuleSpec(
    key="universal-extractor",
    flag=FLAG,
    router=router,
    prefix="",
    tags=["universal-extractor"],
)
