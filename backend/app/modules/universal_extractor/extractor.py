"""Universal Data Extractor — source detection and extraction engine.

Pipeline:
  1. Detect source type (url pattern / content-type)
  2. Extract raw records via the appropriate strategy
  3. Flatten all nested objects in every record
  4. LLM-assisted schema normalisation

HTML extraction:
  - Quick static pass (httpx + BeautifulSoup): used only for genuine
    structured data (JSON-LD *item arrays*, embedded JSON state, HTML tables).
    Org-metadata JSON-LD (WebSite / Organization with ≤ 2 records) is skipped.
  - Full Playwright crawl (UDECrawler): three parallel strategies — SPA state,
    container DOM, link-anchor grouping — with cookie dismissal, multi-pass
    scroll, stealth mode, and S3 raw HTML upload.
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

_FLATTEN_MAX_DEPTH = 5
_FLATTEN_LIST_EXPAND = 8

# JSON-LD @type values that represent org/site metadata, not content items.
# If ALL records from a JSON-LD block have one of these types, skip the block.
_ORG_TYPES = {
    "WebSite", "WebPage", "WebApplication",
    "Organization", "NewsMediaOrganization", "Corporation",
    "LocalBusiness", "GovernmentOrganization",
    "BreadcrumbList", "SearchAction",
}


# ── Nested object flattening ─────────────────────────────────────────────────

def _flatten_record(
    obj: Any,
    prefix: str = "",
    sep: str = "_",
    _depth: int = 0,
) -> dict[str, Any]:
    """Recursively flatten a nested dict/list into a single-level dict.

    Rules:
    - Nested dicts → keys joined with ``sep``  (``address_city``).
    - Short primitive lists → semicolon-joined string.
    - Short object lists → flattened with numeric index (``tags_0_name``).
    - Anything beyond _FLATTEN_MAX_DEPTH → compact JSON string.
    """
    out: dict[str, Any] = {}

    if _depth >= _FLATTEN_MAX_DEPTH:
        if prefix:
            out[prefix] = (
                json.dumps(obj, default=str, ensure_ascii=False)
                if not isinstance(obj, str) else obj
            )
        return out

    if isinstance(obj, dict):
        for k, v in obj.items():
            safe_k = re.sub(r"[^a-zA-Z0-9]", sep, str(k)).strip(sep) or f"f{k}"
            full_key = f"{prefix}{sep}{safe_k}" if prefix else safe_k
            if isinstance(v, (dict, list)):
                out.update(_flatten_record(v, full_key, sep, _depth + 1))
            else:
                out[full_key] = v

    elif isinstance(obj, list):
        if not obj:
            if prefix:
                out[prefix] = None
        elif len(obj) <= _FLATTEN_LIST_EXPAND and all(
            isinstance(v, (str, int, float, bool, type(None))) for v in obj
        ):
            out[prefix] = "; ".join(str(v) for v in obj if v is not None)
        elif len(obj) <= _FLATTEN_LIST_EXPAND and all(isinstance(v, dict) for v in obj):
            for i, v in enumerate(obj):
                full_key = f"{prefix}{sep}{i}" if prefix else str(i)
                out.update(_flatten_record(v, full_key, sep, _depth + 1))
        else:
            if prefix:
                out[prefix] = json.dumps(obj, default=str, ensure_ascii=False)
    else:
        if prefix:
            out[prefix] = obj

    return out


def _flatten_records(records: list[dict]) -> list[dict]:
    return [_flatten_record(r) for r in records]


# ── Source detection ─────────────────────────────────────────────────────────

def detect_source_type(source_url: str, content_type: str = "") -> str:
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


# ── JSON parsing helpers ─────────────────────────────────────────────────────

def _unwrap_json(data: Any) -> list[Any]:
    """Return the most-record-rich list from an arbitrary JSON value."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        candidates = [
            (k, v) for k, v in data.items()
            if isinstance(v, list) and v
        ]
        if candidates:
            _, best_list = max(candidates, key=lambda kv: len(kv[1]))
            return best_list
        return [data]
    return []


def _parse_json_records(text: str, max_records: int) -> list[dict]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    rows = _unwrap_json(data)
    records: list[dict] = []
    for item in rows[:max_records]:
        if isinstance(item, dict):
            records.append(_flatten_record(item))
        elif item is not None:
            records.append({"value": item})
    return records


def _parse_csv_text(text: str, max_records: int) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text.strip()))
    return [dict(row) for row in list(reader)[:max_records]]


def _parse_xml_text(text: str, max_records: int) -> list[dict]:
    try:
        from xml.etree import ElementTree as ET
        root = ET.fromstring(text)
        records = []
        for child in root:
            row: dict[str, str] = {}
            for sub in child:
                row[sub.tag] = (sub.text or "").strip()
                for attr_k, attr_v in sub.attrib.items():
                    row[f"{sub.tag}_{attr_k}"] = attr_v
            if row:
                records.append(row)
            if len(records) >= max_records:
                break
        return records
    except Exception:
        return [{"raw_xml": text[:500]}]


# ── API / HTTP extraction ─────────────────────────────────────────────────────

async def _extract_api(
    url: str,
    headers: dict,
    on_progress: _Callback,
    max_records: int,
) -> tuple[str, list[dict]]:
    if on_progress:
        await on_progress(f"Fetching API endpoint: {url}")
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        response = await client.send(client.build_request("GET", url, headers=headers))
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


# ── Static HTML pre-check (quick, no JS rendering) ───────────────────────────

def _is_org_metadata(records: list[dict]) -> bool:
    """Return True if the records look like site/org metadata (not content items)."""
    if not records or len(records) > 3:
        return False
    for r in records:
        # After flattening, @type becomes _type
        rtype = str(r.get("_type") or r.get("type") or r.get("@type") or "")
        if any(ot in rtype for ot in _ORG_TYPES):
            return True
    return False


async def _static_html_quickcheck(
    url: str,
    on_progress: _Callback,
    max_records: int,
) -> list[dict]:
    """Fast static extraction (httpx + BeautifulSoup).

    Only returns records for clearly structured sources:
    - JSON-LD with genuine item arrays (not org metadata)
    - Embedded JS state blobs
    - HTML tables

    Returns an empty list if the page needs JS rendering.
    """

    from bs4 import BeautifulSoup

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    )
                },
            )
    except Exception:
        return []

    soup = BeautifulSoup(resp.text, "lxml")

    # ── JSON-LD ────────────────────────────────────────────────────────────
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "")
            rows = _unwrap_json(data)
            if not rows:
                continue
            records = [_flatten_record(r) for r in rows[:max_records] if isinstance(r, dict)]
            # Skip org-metadata blocks — they return 1-2 records about the site itself
            if records and not _is_org_metadata(records) and len(records) >= 3:
                if on_progress:
                    await on_progress(f"Static JSON-LD: {len(records)} item records.")
                return records
        except Exception:
            pass

    # ── Embedded JS state (Next.js, Nuxt, etc.) ────────────────────────────
    _SPA_PATTERNS = [
        r"window\.__NEXT_DATA__\s*=\s*({.+?})\s*(?:;|</script>)",
        r"window\.__NUXT__\s*=\s*({.+?})\s*(?:;|</script>)",
        r"window\.__APP_STATE__\s*=\s*({.+?})\s*(?:;|</script>)",
        r"window\.__INITIAL_STATE__\s*=\s*({.+?})\s*(?:;|</script>)",
        r"window\.__PRELOADED_STATE__\s*=\s*({.+?})\s*(?:;|</script>)",
    ]
    for tag in soup.find_all("script"):
        src = tag.string or ""
        for pattern in _SPA_PATTERNS:
            m = re.search(pattern, src, re.S)
            if m:
                try:
                    records = _parse_json_records(m.group(1), max_records)
                    if len(records) >= 3:
                        if on_progress:
                            await on_progress(f"Static SPA state: {len(records)} records.")
                        return records
                except Exception:
                    pass

    # ── HTML tables ────────────────────────────────────────────────────────
    tables = soup.find_all("table")
    if tables:
        best_table = max(tables, key=lambda t: len(t.find_all("tr")))
        headers_row = best_table.find("tr")
        if headers_row:
            cols = [
                th.get_text(strip=True) or f"col_{i}"
                for i, th in enumerate(headers_row.find_all(["th", "td"]))
            ]
            rows_el = best_table.find_all("tr")[1:]
            records = []
            for row in rows_el[:max_records]:
                cells = row.find_all(["td", "th"])
                rec = {cols[i]: c.get_text(strip=True) for i, c in enumerate(cells) if i < len(cols)}
                if rec:
                    records.append(rec)
            if len(records) >= 3:
                if on_progress:
                    await on_progress(f"Static HTML table: {len(records)} records.")
                return records

    return []


# ── Full Playwright crawl ─────────────────────────────────────────────────────

async def _extract_html_playwright(
    url: str,
    extraction_prompt: str,
    on_progress: _Callback,
    max_records: int,
    max_pages: int,
    session_id: int = 0,
    extra_headers: dict | None = None,
    provider: LLMProvider | None = None,
) -> list[dict]:
    from app.modules.universal_extractor.crawler import UDECrawler
    crawler = UDECrawler(provider, max_pages=max_pages)
    _, records = await crawler.crawl(
        url,
        extraction_prompt,
        session_id=session_id,
        max_records=max_records,
        extra_headers=extra_headers or {},
        on_progress=on_progress,
    )
    return records


# ── LLM schema normalisation ──────────────────────────────────────────────────

_NORMALIZE_SYSTEM = """You are a data normalisation expert.
Given sample records from a data source (already flattened), propose a unified JSON schema
that captures the key fields. Return ONLY a JSON object with keys being the normalised field
names (snake_case) and values being the source field name(s) that map to it, or null if
the field must be derived.
Example: {"title": "name", "price": ["cost","price","amount"], "location": "city"}
"""


async def normalize_schema(
    sample_records: list[dict],
    extraction_prompt: str,
    provider: LLMProvider,
) -> dict[str, Any]:
    sample_text = json.dumps(sample_records[:5], indent=2, default=str)
    prompt = (
        f"User wants to extract: {extraction_prompt}\n\n"
        f"Sample records (already flattened — nested keys use underscores):\n{sample_text}\n\n"
        "Propose a unified schema mapping."
    )
    try:
        return await provider.propose_json(_NORMALIZE_SYSTEM, prompt, fallback={})
    except Exception:
        return {}


def apply_schema(records: list[dict], schema: dict[str, Any]) -> list[dict]:
    """Map records to the normalised schema.

    Looks up each source key with: direct match → underscore variant →
    case-insensitive match.  Leftover fields are merged into the record
    directly so no information is lost.
    """
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
                c_us = re.sub(r"[.\-/]", "_", c)
                if c_us in raw:
                    row[norm_key] = raw[c_us]
                    used_keys.add(c_us)
                    break
                c_lower = c.lower()
                for raw_k in raw:
                    if raw_k.lower() == c_lower:
                        row[norm_key] = raw[raw_k]
                        used_keys.add(raw_k)
                        break
                if norm_key in row:
                    break

        for k, v in raw.items():
            if k not in used_keys and k not in row:
                row[k] = v

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
    session_id: int = 0,
) -> tuple[str, list[dict], dict]:
    """Main entrypoint.

    Returns ``(detected_type, raw_records, schema_mapping)``.
    ``raw_records`` are always flat dicts (nested objects recursively unpacked).
    """
    cfg = source_config or {}
    headers = cfg.get("headers", {})

    detected = detect_source_type(source_url) if source_type == "auto" else source_type

    raw: list[dict] = []

    # ── Kaggle ────────────────────────────────────────────────────────────
    if detected == "kaggle":
        from app.modules.shared.kaggle import download_and_parse
        if on_progress:
            await on_progress(f"Downloading Kaggle dataset '{source_url}'…")
        raw = _flatten_records(
            await download_and_parse(source_url.replace("kaggle://", ""), max_rows=max_records)
        )

    # ── REST API / JSON / CSV / XML ───────────────────────────────────────
    elif detected in ("api", "json", "csv", "xml"):
        detected, raw = await _extract_api(source_url, headers, on_progress, max_records)

    # ── Inline text paste ─────────────────────────────────────────────────
    elif detected == "text":
        raw = (
            _parse_json_records(source_url, max_records)
            or _parse_csv_text(source_url, max_records)
        )
        if on_progress:
            await on_progress(f"Parsed {len(raw)} records from inline text.")

    # ── HTML pages ────────────────────────────────────────────────────────
    elif detected == "html":
        if on_progress:
            await on_progress("Detected HTML — running quick static check…")

        # Fast path: structured data already in the HTML (no JS needed)
        raw = await _static_html_quickcheck(source_url, on_progress, max_records)

        if raw:
            if on_progress:
                await on_progress(
                    f"Static extraction yielded {len(raw)} records — "
                    "skipping Playwright."
                )
        else:
            if on_progress:
                await on_progress(
                    "Static check found no structured data — "
                    "launching full Playwright crawler…"
                )
            raw = await _extract_html_playwright(
                source_url,
                extraction_prompt,
                on_progress,
                max_records,
                max_pages,
                session_id=session_id,
                extra_headers=headers,
                provider=provider,
            )

    # ── Nothing extracted ─────────────────────────────────────────────────
    if not raw:
        if on_progress:
            await on_progress("No records extracted from source.")
        return detected, [], {}

    if on_progress:
        await on_progress(
            f"{len(raw)} raw records extracted. Running LLM schema normalisation…"
        )

    schema: dict = {}
    if provider is not None:
        schema = await normalize_schema(raw, extraction_prompt, provider)
        if schema and on_progress:
            await on_progress(f"Schema inferred: {list(schema.keys())}")

    return detected, raw, schema
