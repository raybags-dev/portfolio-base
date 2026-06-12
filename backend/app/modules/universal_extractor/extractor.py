"""Universal Data Extractor — source detection and extraction engine.

Pipeline:
  1. Detect source type from URL / content
  2. Extract raw records via the appropriate strategy
  3. Flatten nested objects in every record
  4. LLM-assisted schema normalization
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

# Maximum nesting depth to unpack — prevents explosive key counts on
# deeply recursive structures (e.g. graph APIs).
_FLATTEN_MAX_DEPTH = 5
# Max list items expanded inline; longer lists become a compact JSON string.
_FLATTEN_LIST_EXPAND = 8


# ── Nested object flattening ─────────────────────────────────────────────────

def _flatten_record(
    obj: Any,
    prefix: str = "",
    sep: str = "_",
    _depth: int = 0,
) -> dict[str, Any]:
    """Recursively flatten a nested dict/list into a single-level dict.

    Rules:
    - Nested dicts → keys joined with `sep` (e.g. ``address_city``).
    - Short lists of primitives → semicolon-joined string.
    - Short lists of dicts → flattened with numeric indices
      (e.g. ``tags_0_name``, ``tags_1_name``).
    - Anything beyond _FLATTEN_MAX_DEPTH → serialised as a JSON string.
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
            # Sanitise key: keep alphanumerics and underscores only
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
            # Short primitive list → join
            out[prefix] = "; ".join(str(v) for v in obj if v is not None)
        elif len(obj) <= _FLATTEN_LIST_EXPAND and all(isinstance(v, dict) for v in obj):
            # Short list of dicts → expand with index
            for i, v in enumerate(obj):
                full_key = f"{prefix}{sep}{i}" if prefix else str(i)
                out.update(_flatten_record(v, full_key, sep, _depth + 1))
        else:
            # Long or heterogeneous list → compact JSON string
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
        # Prefer whichever top-level value is a non-empty list of dicts
        candidates = [
            (k, v) for k, v in data.items()
            if isinstance(v, list) and v
        ]
        if candidates:
            # Pick the longest list
            best_key, best_list = max(candidates, key=lambda kv: len(kv[1]))
            return best_list
        # Single-object response → wrap in list
        return [data]
    return []


def _parse_json_records(text: str, max_records: int) -> list[dict]:
    """Parse JSON text into a flat list of dicts, unpacking all nested objects."""
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
                # Expand attributes of each sub-element too
                text_val = (sub.text or "").strip()
                row[sub.tag] = text_val
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


# ── S3 upload helper ─────────────────────────────────────────────────────────

async def _save_raw_html_to_s3(url: str, html: str, label: str = "html") -> str | None:
    try:
        import hashlib

        from app.core.storage_s3 import is_configured, upload_blob
        if not is_configured():
            return None
        url_hash = hashlib.sha1(url.encode()).hexdigest()[:12]
        key = f"ude/raw/{label}_{url_hash}.html"
        await upload_blob(key, html, content_type="text/html; charset=utf-8")
        return key
    except Exception:
        return None


# ── Static HTML extraction ───────────────────────────────────────────────────

async def _extract_html_static(url: str, on_progress: _Callback, max_records: int) -> list[dict]:
    """Comprehensive HTML extraction using BeautifulSoup.

    Strategy:
    1. Save raw HTML to S3.
    2. Try JSON-LD embedded structured data (flatten nested objects).
    3. Try embedded JS state blobs.
    4. Try HTML tables.
    5. Comprehensive DOM walk: group sibling leaf-nodes into pseudo-records.
    """
    import asyncio

    from bs4 import BeautifulSoup

    if on_progress:
        await on_progress(f"Fetching page: {url}")
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})

    raw_html = resp.text
    asyncio.ensure_future(_save_raw_html_to_s3(url, raw_html))

    soup = BeautifulSoup(raw_html, "lxml")

    # ── 1. JSON-LD embedded data ───────────────────────────────────────────
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "")
            rows = _unwrap_json(data)
            if not rows:
                continue
            records = [_flatten_record(r) for r in rows[:max_records] if isinstance(r, dict)]
            if records:
                if on_progress:
                    await on_progress(f"JSON-LD: extracted {len(records)} records.")
                return records
        except Exception:
            pass

    # ── 2. Embedded JS state blobs ─────────────────────────────────────────
    for tag in soup.find_all("script"):
        src = tag.string or ""
        m = re.search(
            r"window\.__(?:INITIAL|PRELOADED|NUXT|APP)_?(?:STATE|DATA)__\s*=\s*({.+?});?\s*\n",
            src, re.S,
        )
        if m:
            try:
                state = json.loads(m.group(1))
                records = _parse_json_records(json.dumps(state), max_records)
                if records:
                    if on_progress:
                        await on_progress(f"JS state blob: extracted {len(records)} records.")
                    return records
            except Exception:
                pass

    # ── 3. HTML tables ─────────────────────────────────────────────────────
    tables = soup.find_all("table")
    if tables:
        best_table = max(tables, key=lambda t: len(t.find_all("tr")))
        headers_row = best_table.find("tr")
        if headers_row:
            cols = [
                th.get_text(strip=True) or f"col_{i}"
                for i, th in enumerate(headers_row.find_all(["th", "td"]))
            ]
            rows = best_table.find_all("tr")[1:]
            records = []
            for row in rows[:max_records]:
                cells = row.find_all(["td", "th"])
                rec = {cols[i]: c.get_text(strip=True) for i, c in enumerate(cells) if i < len(cols)}
                if rec:
                    records.append(rec)
            if records:
                if on_progress:
                    await on_progress(f"HTML table: extracted {len(records)} records.")
                return records

    # ── 4. Comprehensive DOM walk ─────────────────────────────────────────
    for tag in soup.find_all([
        "script", "style", "noscript", "svg",
        "header", "footer", "nav", "aside", "meta", "link",
    ]):
        tag.decompose()

    EXTRACT_TAGS = {
        "div", "span", "p", "a", "li", "td", "th",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "button", "label", "option", "dt", "dd",
        "strong", "em", "b", "i", "caption", "time", "data",
    }

    def _get_leaf_text(el: Any) -> str:
        inline = {"span", "a", "strong", "em", "b", "i", "abbr", "code", "small", "time"}
        children_tags = [c for c in el.children if hasattr(c, "name") and c.name]
        if any(c.name not in inline for c in children_tags):
            return ""
        return el.get_text(separator=" ", strip=True)

    containers = soup.find_all([
        "article", "section", "main",
        "[class*='card']", "[class*='item']",
        "[class*='row']", "[class*='result']",
        "[class*='listing']", "[class*='product']",
        "[class*='entry']", "[class*='post']",
    ])
    if not containers:
        containers = [c for c in soup.find_all("div", recursive=False) if len(c.find_all()) >= 3]
    if not containers:
        containers = [soup.body or soup]

    records: list[dict] = []
    seen_texts: set[str] = set()

    for container in containers[: max_records * 3]:
        row: dict[str, Any] = {}
        texts_found: list[str] = []

        for el in container.find_all(list(EXTRACT_TAGS)):
            t = _get_leaf_text(el)
            if not t or len(t) < 2 or len(t) > 500:
                continue
            if t in seen_texts:
                continue
            seen_texts.add(t)
            texts_found.append(t)
            tag_name = el.name or "text"
            key_hint = (
                el.get("id")
                or (el.get("class") or [""])[0].replace("-", "_").lower()[:30]
                or tag_name
            )
            base_key = re.sub(r"[^a-z0-9_]", "_", key_hint.lower())[:30] or tag_name
            key = base_key
            counter = 1
            while key in row:
                key = f"{base_key}_{counter}"
                counter += 1
            row[key] = t

            if el.name == "a":
                href = el.get("href", "")
                if href and href.startswith("http"):
                    row[f"{key}_href"] = href
            if el.name == "img":
                src = el.get("src") or el.get("data-src") or ""
                if src:
                    row[f"{key}_src"] = src

        if texts_found:
            records.append(row)
        if len(records) >= max_records:
            break

    if records:
        return records

    paras = [p.get_text(strip=True) for p in soup.find_all("p") if len(p.get_text(strip=True)) > 30]
    return [{"text": p} for p in paras[:max_records]] if paras else []


# ── Playwright extraction ─────────────────────────────────────────────────────

async def _extract_html_playwright(
    url: str,
    extraction_prompt: str,
    on_progress: _Callback,
    max_records: int,
    max_pages: int,
) -> list[dict]:
    import asyncio as _asyncio

    from app.modules.agents.llm import get_provider
    from app.modules.hotel_reviews.playwright_engine import CrawlEngine

    provider = get_provider()
    engine = CrawlEngine(provider, max_pages=max_pages)
    records: list[dict] = []
    _raw_html_saved = False

    async def on_record(record: dict, _url: str) -> None:
        if len(records) < max_records:
            records.append(record)

    async def _on_prog(msg: str) -> None:
        nonlocal _raw_html_saved
        if not _raw_html_saved and "Loading" in msg:
            _asyncio.ensure_future(_save_raw_html_to_s3(url, "", label="playwright"))
            _raw_html_saved = True
        if on_progress:
            await on_progress(msg)

    await engine.run(
        url,
        extraction_prompt,
        on_record=on_record,
        on_progress=_on_prog,
        max_items_per_page=max_records,
    )
    # Playwright records are already flat (JS extraction returns flat dicts);
    # run flatten anyway to handle any nested values returned by LLM fallback.
    return _flatten_records(records)


# ── LLM schema normalization ─────────────────────────────────────────────────

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
        schema = await provider.propose_json(_NORMALIZE_SYSTEM, prompt, fallback={})
        return schema
    except Exception:
        return {}


def apply_schema(records: list[dict], schema: dict[str, Any]) -> list[dict]:
    """Map records to the normalised schema.

    For each schema field, try each candidate source key including underscore
    and dot variants. Leftover fields are merged into the record directly
    (not buried under a ``metadata`` sub-dict) so no information is lost.
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
                # Direct lookup
                if c in raw:
                    row[norm_key] = raw[c]
                    used_keys.add(c)
                    break
                # Underscore variant (flattened "a.b" → "a_b")
                c_us = re.sub(r"[.\-/]", "_", c)
                if c_us in raw:
                    row[norm_key] = raw[c_us]
                    used_keys.add(c_us)
                    break
                # Case-insensitive fallback
                c_lower = c.lower()
                for raw_k in raw:
                    if raw_k.lower() == c_lower:
                        row[norm_key] = raw[raw_k]
                        used_keys.add(raw_k)
                        break
                if norm_key in row:
                    break

        # Merge leftover fields at the top level so no information is lost.
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
) -> tuple[str, list[dict], dict]:
    """Main entrypoint.

    Returns (detected_type, raw_records, schema_mapping).
    raw_records are always flat dicts (nested objects unpacked).
    """
    cfg = source_config or {}
    headers = cfg.get("headers", {})

    if source_type == "auto":
        detected = detect_source_type(source_url)
    else:
        detected = source_type

    raw: list[dict] = []

    if detected == "kaggle":
        from app.modules.shared.kaggle import download_and_parse
        if on_progress:
            await on_progress(f"Downloading Kaggle dataset '{source_url}'…")
        raw = await download_and_parse(
            source_url.replace("kaggle://", ""), max_rows=max_records
        )
        raw = _flatten_records(raw)

    elif detected in ("api", "json", "csv", "xml"):
        detected, raw = await _extract_api(source_url, headers, on_progress, max_records)

    elif detected == "text":
        text = source_url
        raw = (
            _parse_json_records(text, max_records)
            or _parse_csv_text(text, max_records)
        )
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
        await on_progress(
            f"{len(raw)} raw records extracted. Running LLM schema normalisation…"
        )

    schema: dict = {}
    if provider is not None:
        schema = await normalize_schema(raw, extraction_prompt, provider)
        if schema and on_progress:
            await on_progress(f"Schema inferred: {list(schema.keys())}")

    return detected, raw, schema
