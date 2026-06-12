"""Universal Data Extractor — source detection and extraction engine.

Pipeline:
  1. Detect source type from URL / content
  2. Extract raw records via the appropriate strategy
  3. LLM-assisted schema normalization
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.modules.agents.llm import LLMProvider

_Callback = Callable[[str], Awaitable[None]] | None


# ── Source detection ─────────────────────────────────────────────────────────

def detect_source_type(source_url: str, content_type: str = "") -> str:
    """Infer source type from URL and content-type header."""
    url = source_url.lower().strip()
    if url.startswith("kaggle://"):
        return "kaggle"
    if url.startswith("data:text/csv") or url.endswith(".csv"):
        return "csv"
    if url.startswith("data:") or url.endswith(".json"):
        return "json"
    if "json" in content_type:
        return "api"
    if "csv" in content_type:
        return "csv"
    if "xml" in content_type or url.endswith(".xml"):
        return "xml"
    if url.startswith("http"):
        return "html"
    return "text"


# ── Extraction strategies ─────────────────────────────────────────────────────

async def _extract_kaggle(ref: str, on_progress: _Callback, max_records: int) -> list[dict]:
    from app.modules.shared.kaggle import download_and_parse
    if on_progress:
        await on_progress(f"Downloading Kaggle dataset '{ref}'…")
    return await download_and_parse(ref.replace("kaggle://", ""), max_rows=max_records)


def _parse_json_records(text: str, max_records: int) -> list[dict]:
    """Extract a list of dicts from a JSON response, handling nested structures."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []

    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        # Look for a top-level array value
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                rows = v
                break
        else:
            rows = [data]
    else:
        return []

    flat: list[dict] = []
    for item in rows[:max_records]:
        if isinstance(item, dict):
            flat.append(item)
        else:
            flat.append({"value": item})
    return flat


def _parse_csv_text(text: str, max_records: int) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text.strip()))
    return [dict(row) for row in list(reader)[:max_records]]


def _parse_xml_text(text: str, max_records: int) -> list[dict]:
    try:
        from xml.etree import ElementTree as ET
        root = ET.fromstring(text)
        records = []
        for child in root:
            row = {sub.tag: (sub.text or "").strip() for sub in child}
            if row:
                records.append(row)
            if len(records) >= max_records:
                break
        return records
    except Exception:
        return [{"raw_xml": text[:500]}]


async def _extract_api(
    url: str,
    headers: dict,
    on_progress: _Callback,
    max_records: int,
) -> tuple[str, list[dict]]:
    if on_progress:
        await on_progress(f"Fetching API endpoint: {url}")
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = client.build_request("GET", url, headers=headers)
        response = await client.send(resp)
        response.raise_for_status()
    ct = response.headers.get("content-type", "")
    text = response.text

    if "json" in ct or text.lstrip().startswith(("{", "[")):
        records = _parse_json_records(text, max_records)
        detected = "api"
    elif "csv" in ct:
        records = _parse_csv_text(text, max_records)
        detected = "csv"
    elif "xml" in ct:
        records = _parse_xml_text(text, max_records)
        detected = "xml"
    else:
        records = [{"raw_content": text[:2000]}]
        detected = "html"

    if on_progress:
        await on_progress(f"Extracted {len(records)} raw records from API.")
    return detected, records


async def _extract_html_static(url: str, on_progress: _Callback, max_records: int) -> list[dict]:
    """Extract structured data from HTML using BeautifulSoup (tables + lists)."""
    from bs4 import BeautifulSoup

    if on_progress:
        await on_progress(f"Fetching page: {url}")
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})

    soup = BeautifulSoup(resp.text, "lxml")

    # Try JSON-LD embedded data first
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "")
            if isinstance(data, list) and data:
                return data[:max_records]
            if isinstance(data, dict) and "@type" in data:
                items = data.get("itemListElement") or data.get("about") or []
                if items:
                    return [i for i in items if isinstance(i, dict)][:max_records]
        except Exception:
            pass

    # Try embedded JSON in script tags
    for tag in soup.find_all("script"):
        src = tag.string or ""
        m = re.search(r"window\.__(?:INITIAL|PRELOADED|NUXT)_?STATE__\s*=\s*({.+?});?\s*\n", src, re.S)
        if m:
            try:
                state = json.loads(m.group(1))
                records = _parse_json_records(json.dumps(state), max_records)
                if records:
                    return records
            except Exception:
                pass

    # Try HTML tables
    tables = soup.find_all("table")
    if tables:
        best_table = max(tables, key=lambda t: len(t.find_all("tr")))
        headers_row = best_table.find("tr")
        if headers_row:
            cols = [th.get_text(strip=True) or f"col_{i}" for i, th in enumerate(headers_row.find_all(["th", "td"]))]
            rows = best_table.find_all("tr")[1:]
            records = []
            for row in rows[:max_records]:
                cells = row.find_all(["td", "th"])
                records.append({cols[i]: c.get_text(strip=True) for i, c in enumerate(cells) if i < len(cols)})
            if records:
                return records

    # Try ordered/unordered lists of items
    for lst in soup.find_all(["ul", "ol"]):
        items = lst.find_all("li")
        if len(items) >= 3:
            records = [{"item": li.get_text(strip=True)} for li in items[:max_records] if li.get_text(strip=True)]
            if records:
                return records

    # Fallback: paragraphs as text records
    paras = [p.get_text(strip=True) for p in soup.find_all("p") if len(p.get_text(strip=True)) > 30]
    return [{"text": p} for p in paras[:max_records]] if paras else []


async def _extract_html_playwright(
    url: str,
    extraction_prompt: str,
    on_progress: _Callback,
    max_records: int,
    max_pages: int,
) -> list[dict]:
    """Use the existing CrawlEngine (Playwright + LLM) for JS-heavy pages."""
    from app.modules.agents.llm import get_provider
    from app.modules.hotel_reviews.playwright_engine import CrawlEngine

    provider = get_provider()
    engine = CrawlEngine(provider, max_pages=max_pages)
    records: list[dict] = []

    async def on_record(record: dict, _url: str) -> None:
        if len(records) < max_records:
            records.append(record)

    async def _on_prog(msg: str) -> None:
        if on_progress:
            await on_progress(msg)

    await engine.run(url, extraction_prompt, on_record=on_record, on_progress=_on_prog)
    return records


# ── LLM schema normalization ─────────────────────────────────────────────────

_NORMALIZE_SYSTEM = """You are a data normalisation expert.
Given sample records from a data source, propose a unified JSON schema that captures the key fields.
Return ONLY a JSON object with keys being the normalised field names (snake_case) and values being
the source field name(s) that map to it, or null if the field must be derived.
Example: {"title": "name", "price": ["cost","price","amount"], "location": "city", "date": "created_at"}
"""


async def normalize_schema(
    sample_records: list[dict],
    extraction_prompt: str,
    provider: LLMProvider,
) -> dict[str, Any]:
    """Ask the LLM to propose a unified schema for the sample records."""
    sample_text = json.dumps(sample_records[:5], indent=2, default=str)
    prompt = (
        f"User wants to extract: {extraction_prompt}\n\n"
        f"Sample records:\n{sample_text}\n\n"
        "Propose a unified schema mapping."
    )
    try:
        schema = await provider.propose_json(_NORMALIZE_SYSTEM, prompt, fallback={})
        return schema
    except Exception:
        return {}


def apply_schema(records: list[dict], schema: dict[str, Any]) -> list[dict]:
    """Apply the proposed schema to all records, copying unmapped fields to metadata."""
    if not schema:
        return records

    normalised = []
    for raw in records:
        row: dict[str, Any] = {}
        used_keys: set[str] = set()

        for norm_key, src in schema.items():
            if src is None:
                continue
            candidates = [src] if isinstance(src, str) else (src if isinstance(src, list) else [])
            for c in candidates:
                if c in raw:
                    row[norm_key] = raw[c]
                    used_keys.add(c)
                    break

        # Remaining raw fields → metadata
        leftover = {k: v for k, v in raw.items() if k not in used_keys}
        if leftover:
            row.setdefault("metadata", leftover)

        normalised.append(row)
    return normalised


# ── Validation ────────────────────────────────────────────────────────────────

def validate_record(record: dict) -> tuple[bool, list[str]]:
    errors: list[str] = []
    for k, v in record.items():
        if v is None or v == "":
            continue
        if isinstance(v, str) and len(v) > 10000:
            errors.append(f"field '{k}' exceeds 10 000 chars")
    return len(errors) == 0, errors


# ── Top-level dispatcher ──────────────────────────────────────────────────────

async def extract(
    source_url: str,
    extraction_prompt: str,
    source_type: str = "auto",
    source_config: dict | None = None,
    max_records: int = 1000,
    max_pages: int = 5,
    provider: LLMProvider | None = None,
    on_progress: _Callback = None,
) -> tuple[str, list[dict], dict]:
    """Main entrypoint.

    Returns (detected_type, raw_records, schema_mapping).
    """
    cfg = source_config or {}
    headers = cfg.get("headers", {})

    # ── Determine detected type ───
    if source_type == "auto":
        detected = detect_source_type(source_url)
    else:
        detected = source_type

    # ── Extract raw records ───────
    raw: list[dict] = []

    if detected == "kaggle":
        raw = await _extract_kaggle(source_url, on_progress, max_records)

    elif detected in ("api", "json", "csv", "xml"):
        detected, raw = await _extract_api(source_url, headers, on_progress, max_records)

    elif detected == "text":
        # Inline text content passed as source_url
        text = source_url
        raw = _parse_json_records(text, max_records) or _parse_csv_text(text, max_records)
        if on_progress:
            await on_progress(f"Parsed {len(raw)} records from inline text.")

    elif detected == "html":
        if on_progress:
            await on_progress("Detected HTML page — trying static extraction…")
        raw = await _extract_html_static(source_url, on_progress, max_records)

        if not raw and on_progress:
            await on_progress("Static extraction empty — falling back to Playwright…")

        if not raw:
            raw = await _extract_html_playwright(
                source_url, extraction_prompt, on_progress, max_records, max_pages
            )

    if not raw:
        if on_progress:
            await on_progress("No records extracted from source.")
        return detected, [], {}

    if on_progress:
        await on_progress(f"{len(raw)} raw records extracted. Running LLM schema normalisation…")

    # ── LLM schema mapping ────────
    schema: dict = {}
    if provider is not None:
        schema = await normalize_schema(raw, extraction_prompt, provider)
        if schema and on_progress:
            await on_progress(f"Schema inferred: {list(schema.keys())}")

    return detected, raw, schema
