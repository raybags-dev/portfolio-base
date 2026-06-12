"""Kaggle dataset search + download helper.

Reads KAGGLE_USERNAME and KAGGLE_KEY from the environment.
Falls back gracefully when credentials are absent — search returns []
and download raises KaggleNotConfigured.
"""

from __future__ import annotations

import csv
import io
import json
import os
import zipfile
from typing import Any

import httpx

KAGGLE_USERNAME = os.getenv("KAGGLE_USERNAME", "")
KAGGLE_KEY = os.getenv("KAGGLE_KEY", "")
KAGGLE_BASE = "https://www.kaggle.com/api/v1"


class KaggleNotConfigured(RuntimeError):
    pass


def _auth() -> tuple[str, str]:
    if not KAGGLE_USERNAME or not KAGGLE_KEY:
        raise KaggleNotConfigured(
            "Set KAGGLE_USERNAME and KAGGLE_KEY environment variables to use Kaggle integration."
        )
    return KAGGLE_USERNAME, KAGGLE_KEY


async def search_datasets(query: str, page: int = 1, page_size: int = 12) -> list[dict[str, Any]]:
    """Search Kaggle datasets. Returns [] when credentials are absent."""
    if not KAGGLE_USERNAME or not KAGGLE_KEY:
        return []

    params: dict[str, Any] = {
        "search": query,
        "page": page,
        "pageSize": page_size,
        "sortBy": "hottest",
        "fileType": "csv",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{KAGGLE_BASE}/datasets/list",
            params=params,
            auth=_auth(),
        )
        resp.raise_for_status()
        raw = resp.json()

    datasets = raw if isinstance(raw, list) else raw.get("datasets", raw.get("items", []))
    results: list[dict[str, Any]] = []
    for ds in datasets:
        owner = ds.get("ownerUser") or ds.get("creatorName") or ds.get("owner", {}).get("name", "unknown")
        slug = ds.get("datasetSlug") or ds.get("slug") or ds.get("ref", "").split("/")[-1]
        results.append({
            "ref": f"{owner}/{slug}",
            "title": ds.get("title", slug),
            "subtitle": ds.get("subtitle", ""),
            "size": ds.get("totalBytes", 0),
            "downloads": ds.get("downloadCount", ds.get("downloads", 0)),
            "votes": ds.get("voteCount", ds.get("votes", 0)),
            "last_updated": ds.get("lastUpdated", ""),
            "tags": [t.get("name", t) if isinstance(t, dict) else str(t) for t in ds.get("tags", [])],
        })
    return results


async def download_and_parse(ref: str, max_rows: int = 3000) -> list[dict[str, Any]]:
    """Download a Kaggle dataset ZIP; return the largest CSV as a list of dicts."""
    auth = _auth()
    owner, slug = ref.split("/", 1)

    async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
        resp = await client.get(
            f"{KAGGLE_BASE}/datasets/download/{owner}/{slug}",
            auth=auth,
        )
        resp.raise_for_status()
        content = resp.content

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        names = zf.namelist()
        csv_names = [n for n in names if n.lower().endswith(".csv")]
        json_names = [n for n in names if n.lower().endswith(".json")]

        if csv_names:
            target = max(csv_names, key=lambda n: zf.getinfo(n).file_size)
            with zf.open(target) as f:
                text = f.read().decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            return [dict(row) for row in list(reader)[:max_rows]]

        if json_names:
            target = max(json_names, key=lambda n: zf.getinfo(n).file_size)
            with zf.open(target) as f:
                data = json.loads(f.read().decode("utf-8", errors="replace"))
            if isinstance(data, list):
                return data[:max_rows]
            return [data]

    raise ValueError(f"No CSV or JSON files found in dataset '{ref}'")
