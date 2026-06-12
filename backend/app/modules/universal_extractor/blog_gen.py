"""Auto-generate a blog post from a completed UDE extraction session."""

from __future__ import annotations

import json
import re
from typing import Any

from app.modules.agents.llm import LLMProvider


def _parse_json_from_text(text: str) -> dict[str, Any] | None:
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


async def generate_blog_post(
    session_data: dict[str, Any],
    analytics: dict[str, Any],
    provider: LLMProvider,
) -> dict[str, Any]:
    total = analytics.get("total_records", 0)
    charts = analytics.get("charts", [])
    chart_summaries = "; ".join(c.get("title", "") for c in charts[:6])
    fields = analytics.get("fields_found", [])
    numeric_fields = analytics.get("numeric_fields", [])
    category_fields = analytics.get("category_fields", [])
    summary_stats = analytics.get("summary_stats", {})
    source_url = session_data.get("source_url", "a data source")
    source_type = session_data.get("source_type_detected", "unknown")

    stats_text = ""
    if summary_stats:
        lines = []
        for field, s in list(summary_stats.items())[:4]:
            lines.append(f"{field}: avg={s.get('avg')}, min={s.get('min')}, max={s.get('max')}")
        stats_text = "\n".join(lines)

    system = (
        "You are a data-driven technical blog writer for a software engineering portfolio. "
        "Write concisely with specific numbers from the data. "
        "You MUST respond with a valid JSON object only — no prose before or after."
    )
    prompt = f"""Write a data extraction insights blog post. Return JSON only.

DATA SUMMARY:
- Source: {source_url}
- Source type: {source_type}
- Session name: {session_data.get("name", "Data Extraction")}
- Total records extracted: {total}
- Fields detected: {", ".join(fields[:12]) or "see analytics"}
- Numeric fields: {", ".join(numeric_fields[:6]) or "none"}
- Category fields: {", ".join(category_fields[:6]) or "none"}
- Statistical summary:
{stats_text or "  (see analytics)"}
- Charts generated: {chart_summaries or "distribution and category charts"}

TECHNOLOGIES USED: Universal Data Extractor (Playwright, BeautifulSoup, httpx),
Groq AI (llama-3.3-70b-versatile) for schema normalisation,
FastAPI + SQLAlchemy (PostgreSQL), S3 blob storage, MongoDB document store,
Next.js + Recharts analytics dashboard.

Return exactly this JSON structure:
{{
  "title": "<specific data-driven title citing the source and record count>",
  "slug": "<kebab-case-url-slug, max 60 chars>",
  "excerpt": "<2-sentence summary using specific numbers from the data>",
  "content": "<full markdown post, minimum 400 words. Sections: ## What Was Extracted, ## Key Findings, ## Field Analysis, ## How It Was Done (mention pipeline: detect → extract → S3 blob → LLM normalise → MongoDB → analytics), ## Takeaways. Be specific with numbers.>"
}}"""

    raw = await provider.complete(system, prompt)
    result = _parse_json_from_text(raw) if raw else None

    if not result or not result.get("title"):
        safe_slug = re.sub(r"[^a-z0-9-]", "-", source_url.lower().replace("https://", "").replace("http://", ""))[:35]
        result = {
            "title": f"Data Extraction: {total} Records from {source_url[:50]}",
            "slug": f"ude-{safe_slug}-{total}",
            "excerpt": (
                f"The Universal Data Extractor pulled {total} structured records from "
                f"`{source_url}`, detecting {len(fields)} fields and generating {len(charts)} analytics charts."
            ),
            "content": (
                f"# Data Extraction Report\n\n"
                f"The Universal Data Extractor was pointed at `{source_url}` "
                f"(detected source type: **{source_type}**).\n\n"
                f"## What Was Extracted\n\n"
                f"- **{total}** structured records\n"
                f"- **{len(fields)}** fields detected: {', '.join(f'`{f}`' for f in fields[:8])}\n\n"
                f"## Field Analysis\n\n"
                f"Numeric fields: {', '.join(numeric_fields) or 'none'}\n\n"
                f"Category fields: {', '.join(category_fields) or 'none'}\n\n"
                + (f"## Statistical Summary\n\n{stats_text}\n\n" if stats_text else "")
                + "## How It Was Done\n\n"
                "1. **Source detection** — auto-detected the source type\n"
                "2. **Extraction** — pulled raw content (stored in S3 before processing)\n"
                "3. **LLM normalisation** — Groq AI unified field names to a consistent schema\n"
                "4. **Storage** — clean records saved to MongoDB, raw blobs to S3\n"
                "5. **Analytics** — distribution, category, and trend charts auto-generated\n\n"
                "## Technology Stack\n\n"
                "- **Playwright / BeautifulSoup / httpx**: multi-strategy extraction\n"
                "- **Groq AI (llama-3.3-70b-versatile)**: schema normalisation\n"
                "- **AWS S3**: raw blob storage\n"
                "- **MongoDB**: structured document store\n"
                "- **FastAPI + Recharts**: API + analytics visualisation\n"
            ),
        }

    return result
