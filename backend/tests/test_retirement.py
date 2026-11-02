"""Tests for the project retirement gates (RETIRE_DATAFORGE flag)."""

from __future__ import annotations

from httpx import AsyncClient

FLAG_URL = "/api/v1/feature-flags/RETIRE_DATAFORGE"


async def _set_retire(client: AsyncClient, auth_headers: dict[str, str], on: bool):
    resp = await client.put(FLAG_URL, headers=auth_headers, json={"enabled": on})
    assert resp.status_code == 200, resp.text


async def test_retire_flag_exists_and_defaults_off(client: AsyncClient):
    resp = await client.get("/api/v1/feature-flags/public")
    assert resp.status_code == 200
    assert "RETIRE_DATAFORGE" in resp.json()
    assert "RETIRE_ANNOTATION" in resp.json()


async def test_pipeline_request_works_when_not_retired(client: AsyncClient, auth_headers: dict[str, str]):
    await _set_retire(client, auth_headers, False)
    resp = await client.post(
        "/api/v1/pipeline-requests",
        json={"name": "Jane", "email": "jane@example.com", "reason": "test"},
    )
    assert resp.status_code == 201
    assert resp.json()["ok"] is True
    assert "retired" not in resp.json()


async def test_pipeline_request_returns_retired_message(client: AsyncClient, auth_headers: dict[str, str]):
    await _set_retire(client, auth_headers, True)
    try:
        resp = await client.post(
            "/api/v1/pipeline-requests",
            json={"name": "Jane", "email": "jane@example.com", "reason": "test"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["ok"] is False
        assert body["retired"] is True
        assert body["message"] == "This project has been retired."

        # check-access also retired
        resp2 = await client.post("/api/v1/pipeline-requests/check-access", json={})
        assert resp2.json()["retired"] is True
    finally:
        await _set_retire(client, auth_headers, False)


async def test_issue_and_reject_also_retired(client: AsyncClient, auth_headers: dict[str, str]):
    # seed a request first (while not retired)
    await _set_retire(client, auth_headers, False)
    await client.post(
        "/api/v1/pipeline-requests",
        json={"name": "Bob", "email": "bob@example.com"},
    )
    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.models.platform import ContactMessage

    async with SessionLocal() as db:
        msg = await db.scalar(select(ContactMessage).order_by(ContactMessage.id.desc()).limit(1))
        assert msg is not None
        msg_id = msg.id

    await _set_retire(client, auth_headers, True)
    try:
        resp = await client.post(
            f"/api/v1/pipeline-requests/{msg_id}/issue-token", headers=auth_headers
        )
        assert resp.json()["retired"] is True
        resp2 = await client.post(
            f"/api/v1/pipeline-requests/{msg_id}/reject", headers=auth_headers
        )
        assert resp2.json()["retired"] is True
    finally:
        await _set_retire(client, auth_headers, False)
