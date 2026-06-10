"""Auto-generate a blog post from a completed crawl session using the LLM."""

from __future__ import annotations

import json
import re
from typing import Any

from app.modules.agents.llm import LLMProvider


def _parse_json_from_text(text: str) -> dict[str, Any] | None:
    """Extract a JSON object from a text response that may contain markdown fences."""
    # Strip markdown code fences
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
    # Find the outermost {...}
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
    """Generate a draft blog post and return it as a dict ready for blog creation."""
    total = session_data.get("total_records", analytics.get("total_records", 0))
    charts = analytics.get("charts", [])
    chart_summaries = "; ".join(c.get("title", "") for c in charts[:5])
    stats = analytics.get("summary_stats", {})
    stats_text = "; ".join(
        f"{k}: avg={v.get('avg')}, max={v.get('max')}" for k, v in list(stats.items())[:4]
    )

    system = (
        "You are a technical blog writer for a data engineering portfolio site. "
        "Write in an engaging, professional tone. Be specific about technology choices. "
        "You MUST respond with a valid JSON object only — no prose before or after."
    )
    prompt = f"""Write a blog post about this completed data-engineering project and return it as JSON.

PROJECT: Web Crawling & Analytics Platform
URL crawled: {session_data.get("target_url", "a commercial website")}
Goal: {session_data.get("collection_prompt", "collect and analyse web data")}
Records collected: {total}
Analytics computed: {chart_summaries or "various charts"}
Key stats: {stats_text or "see analytics"}

TECHNOLOGIES: Playwright (headless Chromium), Groq AI (llama-3.3-70b-versatile),
FastAPI + SQLAlchemy, Next.js + Recharts, self-healing LLM selector recovery.

Return this exact JSON structure:
{{
  "title": "<catchy title specific to the data collected, max 80 chars>",
  "slug": "<kebab-case-url-slug>",
  "excerpt": "<2-sentence summary>",
  "content": "<full markdown blog post, minimum 400 words, covering: what was built, how the LLM pipeline works, insights from the data, tech stack>"
}}"""

    # Use complete() — more reliable than propose_json() for large outputs
    raw = await provider.complete(system, prompt)
    result = _parse_json_from_text(raw) if raw else None

    if not result or not result.get("title"):
        result = {
            "title": f"LLM-Guided Web Crawl: {session_data.get('target_url', 'Dataset Analysis')}",
            "slug": f"crawl-{session_data.get('target_url', 'dataset').replace('https://', '').replace('/', '-').replace('.', '-')[:40]}",
            "excerpt": f"Collected {total} records using Playwright and Groq AI, computing {len(charts)} analytics charts.",
            "content": (
                f"# LLM-Guided Web Crawler\n\n"
                f"This crawl collected **{total} records** from `{session_data.get('target_url', 'the target site')}`.\n\n"
                f"## Goal\n\n{session_data.get('collection_prompt', '')}\n\n"
                f"## Analytics\n\n{chart_summaries or 'See the analytics dashboard for full charts.'}\n\n"
                f"## Technology Stack\n\n"
                f"- **Playwright**: Headless Chromium browser automation\n"
                f"- **Groq AI**: LLM-guided navigation and self-healing extraction\n"
                f"- **FastAPI + SQLAlchemy**: Backend orchestration\n"
                f"- **Next.js + Recharts**: Frontend visualization\n"
            ),
        }

    return result
