"""S3 blob storage — thin async wrapper around boto3.

Used by the Universal Data Extractor to persist raw extracted content (HTML,
JSON dumps, CSV text) before any processing, so the VPS isn't burdened with
storing large blobs in Postgres.

Credentials are resolved in priority order:
  1. S3_ACCESS_KEY / S3_SECRET_KEY in config (explicit override)
  2. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars (boto3 default)

Bucket is resolved as: AWS_S3_BUCKET env var → S3_BUCKET config.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("storage.s3")


def _make_client() -> Any:
    import boto3  # type: ignore[import]

    region = settings.AWS_REGION or settings.S3_REGION
    if settings.S3_ACCESS_KEY:
        return boto3.client(
            "s3",
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=region,
            endpoint_url=settings.S3_ENDPOINT_URL or None,
        )
    if settings.AWS_ACCESS_KEY_ID:
        return boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=region,
            endpoint_url=settings.S3_ENDPOINT_URL or None,
        )
    return boto3.client("s3", region_name=region, endpoint_url=settings.S3_ENDPOINT_URL or None)


def _bucket() -> str:
    return settings.AWS_S3_BUCKET or settings.S3_BUCKET


def is_configured() -> bool:
    return bool(
        settings.S3_ACCESS_KEY
        or settings.AWS_ACCESS_KEY_ID
        or settings.S3_ENDPOINT_URL
    )


async def upload_blob(
    key: str,
    content: str | bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload *content* to S3 at *key*. Returns the full S3 URI."""
    if isinstance(content, str):
        body = content.encode("utf-8")
    else:
        body = content

    bucket = _bucket()

    def _sync() -> None:
        client = _make_client()
        client.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)
        client.close()

    await asyncio.get_event_loop().run_in_executor(None, _sync)
    log.info("s3.upload", key=key, size=len(body))
    return f"s3://{bucket}/{key}"


async def delete_blob(key: str) -> None:
    bucket = _bucket()

    def _sync() -> None:
        client = _make_client()
        client.delete_object(Bucket=bucket, Key=key)
        client.close()

    await asyncio.get_event_loop().run_in_executor(None, _sync)
    log.info("s3.delete", key=key)


async def delete_prefix(prefix: str) -> int:
    """Delete all objects with *prefix*. Returns the number deleted."""
    bucket = _bucket()

    def _sync() -> int:
        client = _make_client()
        paginator = client.get_paginator("list_objects_v2")
        to_delete = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                to_delete.append({"Key": obj["Key"]})

        if not to_delete:
            client.close()
            return 0

        # batch delete (max 1000 per call)
        for i in range(0, len(to_delete), 1000):
            client.delete_objects(
                Bucket=bucket,
                Delete={"Objects": to_delete[i : i + 1000]},
            )
        client.close()
        return len(to_delete)

    count = await asyncio.get_event_loop().run_in_executor(None, _sync)
    log.info("s3.delete_prefix", prefix=prefix, count=count)
    return count


async def count_blobs(prefix: str = "ude/") -> int:
    """Return number of objects with *prefix*."""
    bucket = _bucket()

    def _sync() -> int:
        client = _make_client()
        paginator = client.get_paginator("list_objects_v2")
        total = 0
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            total += page.get("KeyCount", 0)
        client.close()
        return total

    return await asyncio.get_event_loop().run_in_executor(None, _sync)


async def list_blobs(prefix: str = "ude/", limit: int = 100) -> list[dict]:
    """Return metadata for up to *limit* objects with *prefix*."""
    bucket = _bucket()

    def _sync() -> list[dict]:
        client = _make_client()
        paginator = client.get_paginator("list_objects_v2")
        items: list[dict] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                items.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                })
                if len(items) >= limit:
                    break
            if len(items) >= limit:
                break
        client.close()
        return items

    return await asyncio.get_event_loop().run_in_executor(None, _sync)
