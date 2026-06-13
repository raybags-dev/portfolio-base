"""cURL command importer — parse, paginate, extract records via AI."""

from __future__ import annotations

import copy
import json
import re
from typing import Any

from app.core.logging import get_logger

log = get_logger("hotel_reviews.curl_importer")

_PAGE_KEYS = ["pageIndex", "page", "currentPage", "pageNum", "pageNo", "start", "offset", "from"]


# ── cURL parser ───────────────────────────────────────────────────────────────

def parse_curl(raw: str) -> dict[str, Any]:
    """Parse a cURL shell command into {url, method, headers, body}.

    Handles single-quoted args, multi-line (backslash-newline), and both
    --data-raw / --data / -d body variants.
    """
    # Normalise line continuations
    raw = raw.replace("\\\n", " ").replace("\\\r\n", " ").strip()

    # URL: first single- or double-quoted string after 'curl'
    url = ""
    url_m = re.search(r"curl\s+['\"]([^'\"]+)['\"]", raw)
    if url_m:
        url = url_m.group(1)

    # Headers: all -H 'Name: Value'
    headers: dict[str, str] = {}
    for hm in re.finditer(r"-H\s+['\"]([^'\"]+)['\"]", raw):
        name, _, val = hm.group(1).partition(": ")
        headers[name.strip()] = val.strip()

    # Cookie: -b 'string' → add as Cookie header if not already set
    bm = re.search(r"-b\s+['\"]([^'\"]+)['\"]", raw)
    if bm and "Cookie" not in headers and "cookie" not in headers:
        headers["Cookie"] = bm.group(1)

    # Body: try --data-raw, --data, -d with single then double quotes
    body_str: str | None = None
    for flag in ("--data-raw", "--data", "-d"):
        # Single-quoted (JSON won't contain unescaped single quotes)
        m = re.search(re.escape(flag) + r"\s+'([^']+)'", raw, re.DOTALL)
        if m:
            body_str = m.group(1)
            break
        # Double-quoted
        m = re.search(re.escape(flag) + r'\s+"((?:[^"\\]|\\.)+)"', raw, re.DOTALL)
        if m:
            body_str = m.group(1).replace('\\"', '"')
            break

    body_json: dict | None = None
    if body_str:
        try:
            body_json = json.loads(body_str)
        except Exception:
            log.warning("curl.parse.body_not_json", snippet=body_str[:120])

    method = "POST" if body_str else "GET"
    return {"url": url, "method": method, "headers": headers, "body": body_json}


# ── Pagination detector ───────────────────────────────────────────────────────

def detect_pagination(body: dict | None) -> tuple[str, int]:
    """Return (dot-notation path, current_value) for the pagination field."""
    if not body:
        return "page", 1
    # Top-level
    for key in _PAGE_KEYS:
        if key in body:
            return key, int(body[key])
    # One level deep (e.g. head.pageIndex)
    for top, val in body.items():
        if isinstance(val, dict):
            for key in _PAGE_KEYS:
                if key in val:
                    return f"{top}.{key}", int(val[key])
    return "pageIndex", 1


def _set_page(body: dict, path: str, value: int) -> dict:
    b = copy.deepcopy(body)
    parts = path.split(".")
    obj: Any = b
    for p in parts[:-1]:
        obj = obj[p]
    obj[parts[-1]] = value
    return b


# ── AI record extractor ───────────────────────────────────────────────────────

async def _extract_records(response_json: Any, prompt: str, provider: Any) -> list[dict]:
    """Use the LLM to identify and return the data array from the API response."""
    resp_str = json.dumps(response_json, ensure_ascii=False, default=str)[:5000]

    sys_msg = (
        "You are a JSON data extractor. Given an API JSON response and a collection goal, "
        "return ONLY a valid JSON array of record objects. No markdown, no explanation."
    )
    user_msg = f"Collection goal: {prompt}\n\nAPI response:\n{resp_str}"

    try:
        text = await provider.complete(sys_msg, user_msg)
        text = text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = re.sub(r"```(?:json)?", "", text).strip().strip("`").strip()
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [r for r in parsed if isinstance(r, dict)]
        if isinstance(parsed, dict) and "data" in parsed:
            return parsed["data"] if isinstance(parsed["data"], list) else []
    except Exception as exc:
        log.warning("curl.ai_extract_failed", error=str(exc))

    # Fallback: find the largest array anywhere in the response
    if isinstance(response_json, list):
        return [r for r in response_json if isinstance(r, dict)]
    best: list = []
    _find_best_array(response_json, best, depth=0)
    return best


def _find_best_array(obj: Any, best: list, depth: int) -> None:
    if depth > 4:
        return
    if isinstance(obj, list) and all(isinstance(x, dict) for x in obj) and len(obj) > len(best):
        best.clear()
        best.extend(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _find_best_array(v, best, depth + 1)


# ── Main fetcher ──────────────────────────────────────────────────────────────

async def fetch_curl_pages(
    parsed: dict,
    page_count: int,
    collection_prompt: str,
    *,
    on_progress=None,
) -> list[dict]:
    """Make paginated HTTP requests and return all collected records."""
    import httpx  # already in requirements

    from app.modules.agents.llm import get_provider
    provider = get_provider()

    url = parsed["url"]
    method = parsed["method"].upper()
    headers = dict(parsed.get("headers") or {})
    body = parsed.get("body")

    # Remove Transfer-Encoding / Content-Length — httpx sets these
    for drop in ("Transfer-Encoding", "Content-Length", "transfer-encoding", "content-length"):
        headers.pop(drop, None)

    page_key, start_page = detect_pagination(body)

    all_records: list[dict] = []

    async with httpx.AsyncClient(
        timeout=30,
        follow_redirects=True,
        verify=False,  # some APIs use self-signed certs
    ) as client:
        for i in range(page_count):
            page_num = start_page + i
            if on_progress:
                await on_progress(f"Fetching page {i + 1}/{page_count} (pageKey={page_key}, value={page_num})…")

            req_body = _set_page(body, page_key, page_num) if body else None

            try:
                if method == "POST":
                    resp = await client.post(url, json=req_body, headers=headers)
                else:
                    resp = await client.get(url, headers=headers)

                if resp.status_code >= 400:
                    if on_progress:
                        await on_progress(f"Page {page_num}: HTTP {resp.status_code}, stopping.")
                    break

                try:
                    resp_json = resp.json()
                except Exception:
                    if on_progress:
                        await on_progress(f"Page {page_num}: response is not JSON, stopping.")
                    break

                records = await _extract_records(resp_json, collection_prompt, provider)

                if not records:
                    if on_progress:
                        await on_progress(f"Page {page_num}: no records extracted, stopping.")
                    break

                all_records.extend(records)

                if on_progress:
                    await on_progress(
                        f"Page {page_num}: {len(records)} records extracted "
                        f"(running total: {len(all_records)})"
                    )

            except Exception as exc:
                if on_progress:
                    await on_progress(f"Page {page_num}: error — {exc}")
                break

    return all_records
