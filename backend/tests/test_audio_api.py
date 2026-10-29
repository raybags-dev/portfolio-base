"""Tests for the audio API broker module (ENABLE_AUDIO_API)."""

from __future__ import annotations

from httpx import AsyncClient

from app.core.database import SessionLocal
from app.modules.audio_api import aws_broker, service

FLAG_URL = "/api/v1/feature-flags/ENABLE_AUDIO_API"


async def _set_flag(client: AsyncClient, auth_headers: dict[str, str], enabled: bool):
    resp = await client.put(FLAG_URL, headers=auth_headers, json={"enabled": enabled})
    assert resp.status_code == 200, resp.text


async def _deploy_config():
    async with SessionLocal() as db:
        await service.save_config(
            db,
            {
                "region": "eu-central-1",
                "api_url": "https://api.example.com",
                "tracks_table": "tracks-x",
                "progress_table": "progress-x",
                "audio_bucket": "audio-x",
                "admin_key_param": "/x/admin-key",
            },
        )


async def test_module_hidden_when_flag_off(client: AsyncClient):
    assert (await client.get("/api/v1/audio-api/config")).status_code == 404


async def test_config_public_and_safe(client: AsyncClient, auth_headers: dict[str, str]):
    await _set_flag(client, auth_headers, True)
    try:
        resp = await client.get("/api/v1/audio-api/config")
        assert resp.status_code == 200
        body = resp.json()
        assert body["max_upload_mb"] == service.MAX_UPLOAD_MB
        assert body["requires_token"] is False
        assert "secret_access_key" not in body
        assert body["deployed"] is False
    finally:
        await _set_flag(client, auth_headers, False)


def test_validate_upload_rules():
    assert service.validate_upload("ep1.mp3", 10_000, "audio/mpeg") is None
    assert service.validate_upload("ep1.mp3", 0, "audio/mpeg") is not None
    assert service.validate_upload("ep1.mp3", 51 * 1024 * 1024, "audio/mpeg") is not None
    assert service.validate_upload("ep1.exe", 10_000, "audio/mpeg") is not None
    assert service.validate_upload("ep1.mp3", 10_000, "video/mp4") is not None
    assert service.validate_upload("ep1.m4a", 10_000, "audio/mp4") is None


def test_sanitize_filename():
    assert service.sanitize_filename("../../etc/passwd") == "passwd"
    assert service.sanitize_filename("my ep (final).mp3") == "my-ep-final.mp3"
    assert service.sanitize_filename("") == "track.mp3"


async def test_admin_config_roundtrip_and_secret_masking(
    client: AsyncClient, auth_headers: dict[str, str]
):
    await _set_flag(client, auth_headers, True)
    try:
        resp = await client.put(
            "/api/v1/audio-api/admin/config",
            headers=auth_headers,
            json={
                "region": "eu-central-1",
                "api_url": "https://api.example.com",
                "tracks_table": "tracks-x",
                "progress_table": "progress-x",
                "audio_bucket": "audio-x",
                "admin_key_param": "/x/admin-key",
                "secret_access_key": "supersecret",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["deployed"] is True
        assert body["secret_access_key"] == "<set>"

        resp = await client.put(
            "/api/v1/audio-api/admin/config",
            headers=auth_headers,
            json={"region": "eu-west-1", "secret_access_key": "<set>"},
        )
        assert resp.status_code == 200
        async with SessionLocal() as db:
            cfg = await service.get_config(db)
            assert cfg["secret_access_key"] == "supersecret"
            assert cfg["region"] == "eu-west-1"

        assert (await client.get("/api/v1/audio-api/admin/config")).status_code == 401
    finally:
        await _set_flag(client, auth_headers, False)


async def test_admin_tracks_requires_deployed(client: AsyncClient, auth_headers: dict[str, str]):
    await _set_flag(client, auth_headers, True)
    # ensure no config lingers from a previous test in this shared test DB
    async with SessionLocal() as db:
        await service.save_config(db, {})
    try:
        resp = await client.get("/api/v1/audio-api/admin/tracks", headers=auth_headers)
        assert resp.status_code == 503
    finally:
        await _set_flag(client, auth_headers, False)


async def test_admin_create_track_proxies_with_admin_key(
    client: AsyncClient, auth_headers: dict[str, str], monkeypatch
):
    await _set_flag(client, auth_headers, True)
    await _deploy_config()

    captured: dict[str, object] = {}

    async def fake_proxy(cfg, method, path, payload=None):
        captured["method"] = method
        captured["path"] = path
        captured["payload"] = payload
        return 201, {"success": True, "data": {"id": "t-1", "title": payload["title"]}}

    monkeypatch.setattr(aws_broker, "proxy_admin", fake_proxy)
    try:
        resp = await client.post(
            "/api/v1/audio-api/admin/tracks",
            headers=auth_headers,
            json={
                "title": "Episode 1",
                "category": "podcast",
                "durationSeconds": 300,
                "s3Key": "audio/ep1.mp3",
            },
        )
        assert resp.status_code == 201, resp.text
        assert captured["method"] == "POST"
        assert captured["path"] == "/tracks"
        assert captured["payload"]["title"] == "Episode 1"
        assert "artist" not in captured["payload"]  # exclude_none dropped it

        # bad category -> 422 locally, never proxied
        captured.clear()
        resp = await client.post(
            "/api/v1/audio-api/admin/tracks",
            headers=auth_headers,
            json={"title": "X", "category": "nope", "durationSeconds": 10, "s3Key": "audio/x.mp3"},
        )
        assert resp.status_code == 422
        assert not captured
    finally:
        await _set_flag(client, auth_headers, False)


async def test_admin_upload_presign_validates_and_presigns(
    client: AsyncClient, auth_headers: dict[str, str], monkeypatch
):
    await _set_flag(client, auth_headers, True)
    await _deploy_config()

    async def fake_presign(cfg, *, key, content_type, ttl_seconds=900):
        return {"url": f"https://s3.example/{key}?sig=1", "method": "PUT", "headers": {}}

    monkeypatch.setattr(aws_broker, "presign_put", fake_presign)
    try:
        resp = await client.post(
            "/api/v1/audio-api/admin/upload",
            headers=auth_headers,
            json={"filename": "episode 1.mp3", "size_bytes": 5000, "content_type": "audio/mpeg"},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["key"].startswith("audio/")
        assert body["key"].endswith("episode-1.mp3")
        assert body["upload"]["url"].startswith("https://s3.example/audio/")

        # invalid type rejected locally
        resp = await client.post(
            "/api/v1/audio-api/admin/upload",
            headers=auth_headers,
            json={"filename": "x.exe", "size_bytes": 100, "content_type": "audio/mpeg"},
        )
        assert resp.status_code == 422
    finally:
        await _set_flag(client, auth_headers, False)
