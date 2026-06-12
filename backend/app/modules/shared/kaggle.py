"""Kaggle dataset search + download helper.

Uses the `kaggle` Python package which reads credentials from:
  1. ~/.kaggle/kaggle.json  (standard kaggle CLI setup)
  2. KAGGLE_USERNAME + KAGGLE_KEY environment variables

Search returns [] when credentials are absent; download raises KaggleNotConfigured.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any


class KaggleNotConfigured(RuntimeError):
    pass


def _get_kaggle():
    """Authenticate and return the kaggle API object, or raise KaggleNotConfigured."""
    username = os.getenv("KAGGLE_USERNAME", "")
    key = os.getenv("KAGGLE_KEY", "")
    if username:
        os.environ["KAGGLE_USERNAME"] = username
    if key:
        os.environ["KAGGLE_KEY"] = key

    try:
        import kaggle  # noqa: PLC0415
        kaggle.api.authenticate()
        return kaggle
    except ImportError as exc:
        raise KaggleNotConfigured("kaggle package not installed — add kaggle to requirements.txt") from exc
    except Exception as exc:
        msg = str(exc)
        if any(w in msg.lower() for w in ("credential", "username", "key", "api", "auth", "401", "403")):
            raise KaggleNotConfigured(
                "Kaggle credentials not configured. "
                "Either set KAGGLE_USERNAME and KAGGLE_KEY environment variables, "
                "or create ~/.kaggle/kaggle.json with your API token."
            ) from exc
        raise


async def search_datasets(query: str, page: int = 1) -> list[dict[str, Any]]:
    """Search Kaggle datasets. Raises KaggleNotConfigured if credentials are absent."""
    kg = _get_kaggle()

    def _sync_search() -> list[Any]:
        return kg.api.dataset_list(search=query, page=page)

    results = await asyncio.get_event_loop().run_in_executor(None, _sync_search)

    return [
        {
            "ref": getattr(r, "ref", str(r)),
            "title": getattr(r, "title", ""),
            "subtitle": getattr(r, "subtitle", "") or "",
            "size": getattr(r, "total_bytes", 0) or 0,
            "downloads": getattr(r, "download_count", 0) or 0,
            "votes": getattr(r, "vote_count", 0) or 0,
            "last_updated": str(getattr(r, "last_updated", "")),
            "tags": [
                t.get("name", "") if isinstance(t, dict) else getattr(t, "name", str(t))
                for t in (getattr(r, "tags", None) or [])
            ],
        }
        for r in results
    ]


async def download_and_parse(ref: str, max_rows: int = 3000) -> list[dict[str, Any]]:
    """Download a Kaggle dataset, extract the largest CSV/JSON, return records.

    Uses subprocess curl because Python requests sends Host: storage.googleapis.com:443
    which fails GCS signed-URL signature verification (signed for host without port).
    curl normalises Host to storage.googleapis.com (no port) and succeeds.
    """
    _get_kaggle()  # validates credentials are set
    username = os.environ.get("KAGGLE_USERNAME", "")
    key = os.environ.get("KAGGLE_KEY", "")
    if not username or not key:
        raise KaggleNotConfigured("KAGGLE_USERNAME and KAGGLE_KEY must be set")

    tmp_dir = tempfile.mkdtemp(prefix="kaggle_dl_")
    zip_path = os.path.join(tmp_dir, "archive.zip")
    try:
        def _sync_download() -> None:
            # -w prints the HTTP status to stdout; -o writes the body to zip_path
            cmd = [
                "curl", "-L", "--silent",
                "--user", f"{username}:{key}",
                "-w", "%{http_code}",
                f"https://www.kaggle.com/api/v1/datasets/download/{ref}",
                "-o", zip_path,
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=300)
            http_status = result.stdout.decode().strip()

            if http_status != "200":
                body = ""
                if os.path.exists(zip_path):
                    try:
                        body = Path(zip_path).read_text(encoding="utf-8", errors="replace")[:400]
                    except Exception:
                        pass
                if http_status == "403":
                    raise RuntimeError(
                        f"Kaggle denied access to '{ref}' (HTTP 403). "
                        "The dataset may require accepting license terms on kaggle.com/datasets/"
                        f"{ref} before it can be downloaded via API."
                    )
                raise RuntimeError(
                    f"Kaggle download returned HTTP {http_status} for '{ref}'. {body}".strip()
                )

        await asyncio.get_event_loop().run_in_executor(None, _sync_download)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)

        csv_files = sorted(Path(tmp_dir).rglob("*.csv"), key=lambda f: f.stat().st_size, reverse=True)
        json_files = sorted(Path(tmp_dir).rglob("*.json"), key=lambda f: f.stat().st_size, reverse=True)

        if csv_files:
            text = csv_files[0].read_text(encoding="utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            return [dict(row) for row in list(reader)[:max_rows]]

        if json_files:
            data = json.loads(json_files[0].read_text(encoding="utf-8", errors="replace"))
            if isinstance(data, list):
                return data[:max_rows]
            return [data]

        raise ValueError(f"No CSV or JSON files found in dataset '{ref}'")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
