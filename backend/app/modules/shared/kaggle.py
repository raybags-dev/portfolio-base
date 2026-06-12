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
import tempfile
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
    """Download a Kaggle dataset, extract the largest CSV/JSON, return records."""
    kg = _get_kaggle()
    tmp_dir = tempfile.mkdtemp(prefix="kaggle_dl_")
    try:
        def _sync_download() -> None:
            kg.api.dataset_download_files(ref, path=tmp_dir, unzip=True, quiet=True)

        await asyncio.get_event_loop().run_in_executor(None, _sync_download)

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
