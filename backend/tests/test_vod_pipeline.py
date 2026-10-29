"""Tests for the VOD pipeline broker module (ENABLE_VOD_PIPELINE)."""

from __future__ import annotations

from httpx import AsyncClient

from app.core.database import SessionLocal
from app.models.platform import AppToken
from app.modules.vod_pipeline import service

FLAG_URL = "/api/v1/feature-flags/ENABLE_VOD_PIPELINE"


async def _set_flag(client: AsyncClient, auth_headers: dict[str, str], enabled: bool):
    resp = await client.put(FLAG_URL, headers=auth_headers, json={"enabled": enabled})
    assert resp.status_code == 200, resp.text


async def _deploy_config():
    async with SessionLocal() as db:
        await service.save_config(
            db,
            {
                "region": "eu-central-1",
                "raw_bucket": "test-raw",
                "processed_bucket": "test-hls",
                "jobs_table": "test-jobs",
                "cloudfront_domain": "d123.cloudfront.net",
            },
        )


async def _reset_ip_usage():
    """Other suites consume the shared test IP's free run - reset per test."""
    from sqlalchemy import delete

    from app.models.platform import IpUsageLog

    async with SessionLocal() as db:
        await db.execute(delete(IpUsageLog).where(IpUsageLog.app_name == "vod-pipeline"))
        await db.commit()


# ── flag gating ───────────────────────────────────────────────────────────────


async def test_module_hidden_when_flag_off(client: AsyncClient):
    resp = await client.get("/api/v1/vod-pipeline/config")
    assert resp.status_code == 404


async def test_config_public_and_safe(client: AsyncClient, auth_headers: dict[str, str]):
    await _set_flag(client, auth_headers, True)
    try:
        resp = await client.get("/api/v1/vod-pipeline/config")
        assert resp.status_code == 200
        body = resp.json()
        assert body["max_upload_mb"] == service.MAX_UPLOAD_MB
        assert body["quota_per_token"] == service.QUOTA_PER_TOKEN
        assert "secret_access_key" not in body
        assert body["deployed"] is False  # no config saved yet in this test DB
    finally:
        await _set_flag(client, auth_headers, False)


# ── upload validation (pure service-level) ────────────────────────────────────


def test_validate_upload_rules():
    assert service.validate_upload("clip.mp4", 10_000, "video/mp4") is None
    assert service.validate_upload("clip.mp4", 0, "video/mp4") is not None
    assert service.validate_upload("clip.mp4", 101 * 1024 * 1024, "video/mp4") is not None
    assert service.validate_upload("clip.exe", 10_000, "video/mp4") is not None
    assert service.validate_upload("clip.mp4", 10_000, "text/html") is not None
    assert service.validate_upload("clip.mov", 10_000, "video/quicktime") is None


def test_sanitize_filename():
    assert service.sanitize_filename("../../etc/passwd") == "passwd"
    assert service.sanitize_filename("my clip (final).mp4") == "my-clip-final.mp4"
    assert service.sanitize_filename("") == "upload.mp4"


# ── upload endpoint: deploy gate + validation order ───────────────────────────


async def test_upload_blocked_when_not_deployed(client: AsyncClient, auth_headers: dict[str, str]):
    await _set_flag(client, auth_headers, True)
    try:
        resp = await client.post(
            "/api/v1/vod-pipeline/uploads",
            json={"filename": "clip.mp4", "size_bytes": 1000, "content_type": "video/mp4"},
        )
        assert resp.status_code == 503
    finally:
        await _set_flag(client, auth_headers, False)


async def test_upload_validation_runs_before_token_burn(
    client: AsyncClient, auth_headers: dict[str, str]
):
    """An invalid upload must 422 even with no token and without consuming the free run."""
    await _set_flag(client, auth_headers, True)
    await _deploy_config()
    try:
        resp = await client.post(
            "/api/v1/vod-pipeline/uploads",
            json={"filename": "clip.exe", "size_bytes": 1000, "content_type": "video/mp4"},
        )
        assert resp.status_code == 422
    finally:
        await _set_flag(client, auth_headers, False)


async def test_upload_requires_token_no_free_run(
    client: AsyncClient, auth_headers: dict[str, str], monkeypatch
):
    """VOD is token-only: anonymous uploads are rejected with rate_limited."""
    await _set_flag(client, auth_headers, True)
    await _deploy_config()
    await _reset_ip_usage()

    async def fake_presign(cfg, *, key, content_type, max_bytes, ttl_seconds):
        return {"url": f"https://s3.example/{key}?sig=1", "method": "PUT", "headers": {}}

    monkeypatch.setattr(service.aws_broker, "presign_put", fake_presign)
    try:
        # anonymous upload -> rejected immediately, no free run exists
        resp = await client.post(
            "/api/v1/vod-pipeline/uploads",
            json={"filename": "clip.mp4", "size_bytes": 2048, "content_type": "video/mp4"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "rate_limited"
    finally:
        await _set_flag(client, auth_headers, False)


async def test_upload_with_token_respects_quota(
    client: AsyncClient, auth_headers: dict[str, str], monkeypatch
):
    await _set_flag(client, auth_headers, True)
    await _deploy_config()

    async def fake_presign(cfg, *, key, content_type, max_bytes, ttl_seconds):
        return {"url": f"https://s3.example/{key}?sig=1", "method": "PUT", "headers": {}}

    monkeypatch.setattr(service.aws_broker, "presign_put", fake_presign)
    await _reset_ip_usage()

    # mint a vod-scoped 2-use token directly
    from datetime import UTC, datetime, timedelta

    async with SessionLocal() as db:
        tok = AppToken(
            token="vod-test-token",
            expires_at=datetime.now(UTC) + timedelta(hours=24),
            app_name="vod-pipeline",
            max_uses=2,
        )
        db.add(tok)
        await db.commit()

    try:
        # anonymous run rejected (token-only app)
        r = await client.post(
            "/api/v1/vod-pipeline/uploads",
            json={"filename": "a.mp4", "size_bytes": 10, "content_type": "video/mp4"},
        )
        assert r.status_code == 403

        # two token runs allowed
        for name in ("b.mp4", "c.mp4"):
            r = await client.post(
                "/api/v1/vod-pipeline/uploads",
                json={"filename": name, "size_bytes": 10, "content_type": "video/mp4"},
                headers={"X-App-Token": "vod-test-token"},
            )
            assert r.status_code == 201, r.text

        # third token run -> quota exhausted
        r = await client.post(
            "/api/v1/vod-pipeline/uploads",
            json={"filename": "d.mp4", "size_bytes": 10, "content_type": "video/mp4"},
            headers={"X-App-Token": "vod-test-token"},
        )
        assert r.status_code == 403
        assert r.json()["detail"] == "invalid_token"

        # a token scoped to another app is rejected
        async with SessionLocal() as db:
            db.add(
                AppToken(
                    token="audio-test-token",
                    expires_at=datetime.now(UTC) + timedelta(hours=24),
                    app_name="audio-api",
                    max_uses=5,
                )
            )
            await db.commit()
        r = await client.post(
            "/api/v1/vod-pipeline/uploads",
            json={"filename": "e.mp4", "size_bytes": 10, "content_type": "video/mp4"},
            headers={"X-App-Token": "audio-test-token"},
        )
        assert r.status_code == 403
    finally:
        await _set_flag(client, auth_headers, False)


# ── job status sync ───────────────────────────────────────────────────────────


async def test_get_job_and_sync_from_dynamodb(
    client: AsyncClient, auth_headers: dict[str, str], monkeypatch
):
    await _set_flag(client, auth_headers, True)
    await _deploy_config()

    async def fake_fetch(cfg, job_id):
        return {
            "jobId": {"S": job_id},
            "status": {"S": "COMPLETE"},
            "streamUrl": {"S": "https://d123.cloudfront.net/abc/index.m3u8"},
            "mediaConvertJobId": {"S": "mc-123"},
        }

    async def fake_presign(cfg, *, key, content_type, max_bytes, ttl_seconds):
        return {"url": f"https://s3.example/{key}?sig=1", "method": "PUT", "headers": {}}

    monkeypatch.setattr(service.aws_broker, "fetch_job", fake_fetch)
    monkeypatch.setattr(service.aws_broker, "presign_put", fake_presign)
    monkeypatch.setattr(service.aws_broker, "is_aws_available", lambda cfg: True)

    async with SessionLocal() as db:
        job, _ = await service.create_upload(
            db,
            await service.get_config(db),
            filename="clip.mp4",
            size_bytes=100,
            content_type="video/mp4",
            client_ip="1.2.3.4",
            is_guest=True,
            token_id=None,
        )
        job_id = job.job_id

    try:
        resp = await client.get(f"/api/v1/vod-pipeline/jobs/{job_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "COMPLETE"
        assert body["stream_url"].endswith("index.m3u8")

        resp = await client.get("/api/v1/vod-pipeline/jobs/does-not-exist")
        assert resp.status_code == 404
    finally:
        await _set_flag(client, auth_headers, False)


# ── admin config ──────────────────────────────────────────────────────────────


async def test_admin_config_roundtrip_and_secret_masking(
    client: AsyncClient, auth_headers: dict[str, str]
):
    await _set_flag(client, auth_headers, True)
    try:
        resp = await client.put(
            "/api/v1/vod-pipeline/admin/config",
            headers=auth_headers,
            json={
                "region": "eu-central-1",
                "raw_bucket": "raw-x",
                "processed_bucket": "hls-x",
                "jobs_table": "jobs-x",
                "cloudfront_domain": "dx.cloudfront.net",
                "secret_access_key": "supersecret",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["deployed"] is True
        assert body["secret_access_key"] == "<set>"

        # PUT with "<set>" must preserve the stored secret
        resp = await client.put(
            "/api/v1/vod-pipeline/admin/config",
            headers=auth_headers,
            json={"region": "eu-west-1", "secret_access_key": "<set>"},
        )
        assert resp.status_code == 200
        async with SessionLocal() as db:
            cfg = await service.get_config(db)
            assert cfg["secret_access_key"] == "supersecret"
            assert cfg["region"] == "eu-west-1"

        # admin endpoints require admin
        resp = await client.get("/api/v1/vod-pipeline/admin/config")
        assert resp.status_code == 401
    finally:
        await _set_flag(client, auth_headers, False)


async def test_admin_jobs_and_usage(client: AsyncClient, auth_headers: dict[str, str]):
    await _set_flag(client, auth_headers, True)
    try:
        resp = await client.get("/api/v1/vod-pipeline/admin/jobs", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body and "usage" in body
        assert "total_jobs" in body["usage"]
    finally:
        await _set_flag(client, auth_headers, False)
