"""AWS access for the audio broker: SSM admin key, S3 presign, API GW proxy.

Follows the storage_s3.py conventions: lazy boto3 import, sync client wrapped
in an executor, is_configured() guard so the app boots with AWS unset.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("audio.broker")


def is_aws_available(cfg: dict[str, Any]) -> bool:
    if cfg.get("access_key_id") and cfg.get("secret_access_key"):
        return True
    return bool(settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY)


def _make_client(service: str, cfg: dict[str, Any]) -> Any:
    import boto3  # type: ignore[import]

    region = cfg.get("region") or settings.AWS_REGION or "eu-central-1"
    key = cfg.get("access_key_id") or settings.AWS_ACCESS_KEY_ID
    secret = cfg.get("secret_access_key") or settings.AWS_SECRET_ACCESS_KEY
    kwargs: dict[str, Any] = {"region_name": region}
    if service == "s3":
        kwargs["endpoint_url"] = f"https://s3.{region}.amazonaws.com"
    if key and secret:
        kwargs["aws_access_key_id"] = key
        kwargs["aws_secret_access_key"] = secret
    return boto3.client(service, **kwargs)


async def get_admin_key(cfg: dict[str, Any]) -> str | None:
    """Fetch the audio API admin key from SSM (SecureString)."""
    param = cfg.get("admin_key_param")
    if not param:
        return None

    def _sync() -> str | None:
        client = _make_client("ssm", cfg)
        resp = client.get_parameter(Name=param, WithDecryption=True)
        client.close()
        return resp.get("Parameter", {}).get("Value")

    return await asyncio.get_event_loop().run_in_executor(None, _sync)


async def presign_put(
    cfg: dict[str, Any],
    *,
    key: str,
    content_type: str,
    ttl_seconds: int = 900,
) -> dict[str, Any]:
    """Presign a PUT upload into the audio bucket (admin content uploads)."""
    bucket = cfg["audio_bucket"]

    def _sync() -> dict[str, Any]:
        client = _make_client("s3", cfg)
        url = client.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=ttl_seconds,
        )
        client.close()
        return {"url": url, "method": "PUT", "headers": {"Content-Type": content_type}}

    result = await asyncio.get_event_loop().run_in_executor(None, _sync)
    log.info("audio.presign", key=key, ttl=ttl_seconds)
    return result


async def proxy_admin(
    cfg: dict[str, Any],
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    """Forward an admin call to the audio API Gateway with the x-api-key."""
    api_url = cfg["api_url"].rstrip("/")
    admin_key = await get_admin_key(cfg)
    if not admin_key:
        return 503, {"success": False, "message": "Admin key not available (SSM read failed)"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.request(
            method,
            f"{api_url}{path}",
            json=payload,
            headers={"x-api-key": admin_key},
        )
    try:
        body = resp.json()
    except Exception:
        body = {"success": False, "message": resp.text[:200]}
    return resp.status_code, body


async def proxy_public_get(cfg: dict[str, Any], path: str) -> tuple[int, dict[str, Any]]:
    """Server-side public GET against the audio API (health checks, admin views)."""
    api_url = cfg["api_url"].rstrip("/")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{api_url}{path}")
    try:
        body = resp.json()
    except Exception:
        body = {"success": False, "message": resp.text[:200]}
    return resp.status_code, body
