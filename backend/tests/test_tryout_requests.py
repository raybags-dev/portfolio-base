"""Tests for the generalized 24h tryout-token flow (Phase 0).

Covers: app registry, request submit, admin issue/reject, IP-first-free
gateway, app-scoped multi-use quota redemption, app mismatch, expiry,
legacy single-use any-app back-compat, and the Resend email helper.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.email import send_email
from app.models.platform import AppToken, ContactMessage


async def _insert_expired_token(token: str, app_name: str) -> None:
    async with SessionLocal() as db:
        db.add(
            AppToken(
                token=token,
                expires_at=datetime.now(UTC) - timedelta(hours=1),
                app_name=app_name,
                max_uses=5,
            )
        )
        await db.commit()


async def _last_message_id() -> int:
    async with SessionLocal() as db:
        from sqlalchemy import select

        msg = await db.scalar(select(ContactMessage).order_by(ContactMessage.id.desc()).limit(1))
        assert msg is not None
        return msg.id


# ── registry & submit ─────────────────────────────────────────────────────────


async def test_list_tryout_apps(client: AsyncClient):
    resp = await client.get("/api/v1/tryout-requests/apps")
    assert resp.status_code == 200
    apps = {a["key"]: a for a in resp.json()}
    assert set(apps) == {"vod-pipeline", "audio-api", "telemetry-collector"}
    assert apps["vod-pipeline"]["max_uses"] == 2
    assert all(a["page"].startswith("/") for a in apps.values())


async def test_submit_tryout_request(client: AsyncClient):
    resp = await client.post(
        "/api/v1/tryout-requests",
        json={"app_key": "vod-pipeline", "name": "Jane", "email": "jane@example.com", "reason": "hire you"},
    )
    assert resp.status_code == 201
    assert resp.json()["ok"] is True

    async with SessionLocal() as db:
        msg = await db.get(ContactMessage, await _last_message_id())
        assert msg is not None
        assert msg.subject == "Tryout: vod-pipeline"
        assert msg.email == "jane@example.com"


async def test_submit_unknown_app_rejected(client: AsyncClient):
    resp = await client.post(
        "/api/v1/tryout-requests",
        json={"app_key": "nope", "name": "X", "email": "x@example.com"},
    )
    assert resp.status_code == 422
    resp = await client.post("/api/v1/tryout-requests/check-access", json={"app_key": "nope"})
    assert resp.status_code == 422


# ── full vod flow: submit -> issue -> redeem with quota ───────────────────────


async def test_vod_tryout_end_to_end(client: AsyncClient, auth_headers: dict[str, str]):
    # visitor submits a request
    resp = await client.post(
        "/api/v1/tryout-requests",
        json={"app_key": "vod-pipeline", "name": "Recruiter", "email": "rec@example.com"},
    )
    assert resp.status_code == 201
    msg_id = await _last_message_id()

    # admin issues a token (email is a no-op in tests -> delivered False)
    resp = await client.post(f"/api/v1/tryout-requests/{msg_id}/issue-token", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True and body["delivered"] is False
    assert body["app_name"] == "vod-pipeline" and body["max_uses"] == 2
    token = body["token"]

    # gateway: first run free for this IP
    resp = await client.post("/api/v1/tryout-requests/check-access", json={"app_key": "vod-pipeline"})
    assert resp.json() == {"allowed": True, "first_run": True}
    # second run without token -> rate limited
    resp = await client.post("/api/v1/tryout-requests/check-access", json={"app_key": "vod-pipeline"})
    assert resp.json() == {"allowed": False, "reason": "rate_limited"}
    # token redeems max_uses=2 times, then is exhausted
    resp = await client.post(
        "/api/v1/tryout-requests/check-access", json={"app_key": "vod-pipeline", "token": token}
    )
    assert resp.json() == {"allowed": True, "uses_left": 1}
    resp = await client.post(
        "/api/v1/tryout-requests/check-access", json={"app_key": "vod-pipeline", "token": token}
    )
    assert resp.json() == {"allowed": True, "uses_left": 0}
    resp = await client.post(
        "/api/v1/tryout-requests/check-access", json={"app_key": "vod-pipeline", "token": token}
    )
    assert resp.json() == {"allowed": False, "reason": "invalid_token"}

    # expired tokens are rejected even with quota left
    await _insert_expired_token("expired-token-123", "vod-pipeline")
    resp = await client.post(
        "/api/v1/tryout-requests/check-access",
        json={"app_key": "vod-pipeline", "token": "expired-token-123"},
    )
    assert resp.json() == {"allowed": False, "reason": "invalid_token"}

    # issue/reject reject non-tryout messages
    resp = await client.post("/api/v1/tryout-requests/999999/issue-token", headers=auth_headers)
    assert resp.status_code == 404


async def test_issue_token_requires_admin(client: AsyncClient):
    resp = await client.post("/api/v1/tryout-requests/1/issue-token")
    assert resp.status_code == 401


# ── quota + scoping via admin generate ────────────────────────────────────────


async def test_telemetry_quota_via_generate(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/api/v1/access-tokens/generate",
        headers=auth_headers,
        json={"app_name": "telemetry-collector", "max_uses": 2},
    )
    assert resp.status_code == 201
    tok = resp.json()
    assert tok["app_name"] == "telemetry-collector"
    assert tok["max_uses"] == 2 and tok["uses"] == 0

    # burn the free run
    resp = await client.post(
        "/api/v1/tryout-requests/check-access", json={"app_key": "telemetry-collector"}
    )
    assert resp.json() == {"allowed": True, "first_run": True}

    for expected_left in (1, 0):
        resp = await client.post(
            "/api/v1/tryout-requests/check-access",
            json={"app_key": "telemetry-collector", "token": tok["token"]},
        )
        assert resp.json() == {"allowed": True, "uses_left": expected_left}
    resp = await client.post(
        "/api/v1/tryout-requests/check-access",
        json={"app_key": "telemetry-collector", "token": tok["token"]},
    )
    assert resp.json() == {"allowed": False, "reason": "invalid_token"}


async def test_audio_mismatch_and_legacy_back_compat(client: AsyncClient, auth_headers: dict[str, str]):
    # burn the free run for audio-api
    resp = await client.post("/api/v1/tryout-requests/check-access", json={"app_key": "audio-api"})
    assert resp.json() == {"allowed": True, "first_run": True}

    # a token scoped to a different app is rejected
    resp = await client.post(
        "/api/v1/access-tokens/generate",
        headers=auth_headers,
        json={"app_name": "vod-pipeline", "max_uses": 5},
    )
    vod_token = resp.json()["token"]
    resp = await client.post(
        "/api/v1/tryout-requests/check-access",
        json={"app_key": "audio-api", "token": vod_token},
    )
    assert resp.json() == {"allowed": False, "reason": "invalid_token"}

    # legacy token (no body -> any-app, single-use) still works exactly once
    resp = await client.post("/api/v1/access-tokens/generate", headers=auth_headers)
    assert resp.status_code == 201
    legacy = resp.json()
    assert legacy["app_name"] is None and legacy["max_uses"] == 1
    resp = await client.post(
        "/api/v1/tryout-requests/check-access",
        json={"app_key": "audio-api", "token": legacy["token"]},
    )
    assert resp.json() == {"allowed": True, "uses_left": 0}
    resp = await client.post(
        "/api/v1/tryout-requests/check-access",
        json={"app_key": "audio-api", "token": legacy["token"]},
    )
    assert resp.json() == {"allowed": False, "reason": "invalid_token"}

    # legacy dataforge pipeline flow untouched
    resp = await client.post("/api/v1/pipeline-requests/check-access", json={})
    assert resp.json() == {"allowed": True, "first_run": True}


# ── reject flow ───────────────────────────────────────────────────────────────


async def test_reject_tryout_request(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/api/v1/tryout-requests",
        json={"app_key": "audio-api", "name": "Bob", "email": "bob@example.com"},
    )
    assert resp.status_code == 201
    msg_id = await _last_message_id()

    resp = await client.post(f"/api/v1/tryout-requests/{msg_id}/reject", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "delivered": False}

    async with SessionLocal() as db:
        msg = await db.get(ContactMessage, msg_id)
        assert msg is not None and msg.is_read is True


# ── email helper ──────────────────────────────────────────────────────────────


async def test_send_email_noop_without_provider():
    assert settings.RESEND_API_KEY in (None, "")
    assert await send_email(to="a@b.c", subject="s", text="t") is False


async def test_send_email_resend_success(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("Authorization")
        captured["payload"] = request.content.decode()
        return httpx.Response(200, json={"id": "email_123"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        return real_client(transport=transport)

    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr("app.core.email.httpx.AsyncClient", client_factory)

    ok = await send_email(to="user@example.com", subject="Hi", text="body")
    assert ok is True
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["auth"] == "Bearer re_test_key"
    assert "user@example.com" in str(captured["payload"])


async def test_send_email_resend_failure_returns_false(monkeypatch: pytest.MonkeyPatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "domain not verified"})

    transport = httpx.MockTransport(handler)
    real_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        return real_client(transport=transport)

    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr("app.core.email.httpx.AsyncClient", client_factory)

    assert await send_email(to="user@example.com", subject="Hi", text="body") is False
