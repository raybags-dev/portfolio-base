"""LLM-powered insights summary generator.

Produces a human-readable narrative from analytics chart data.
Works with any module (hotel reviews, job analytics, …).
"""

from __future__ import annotations

import json
from typing import Any

_SYSTEM = (
    "You are an expert data analyst writing an executive summary for a general audience. "
    "Given structured analytics results, produce a clear, engaging, insight-rich narrative "
    "of 4–6 paragraphs. Be specific about numbers and trends. "
    "Give 2–3 concrete, actionable takeaways at the end. "
    "Write in flowing prose — no bullet lists, no markdown headers, no formatting marks."
)


async def generate_insights_summary(
    session_name: str,
    source: str,
    records: int,
    analytics: dict[str, Any],
    provider: Any,
) -> str:
    """Call the LLM provider and return a plain-text narrative summary."""

    # Build a compact representation of the analytics for the LLM
    charts_summary: list[dict[str, Any]] = []
    for chart in analytics.get("charts", []):
        charts_summary.append({
            "title": chart.get("title"),
            "type": chart.get("type"),
            "top_items": chart.get("data", [])[:8],
        })

    stats = analytics.get("summary_stats") or {}
    salary_stats = analytics.get("salary_stats")

    prompt = (
        f"Dataset / session: {session_name}\n"
        f"Source: {source}\n"
        f"Total records analysed: {records}\n"
    )
    if stats:
        prompt += f"Summary statistics: {json.dumps(stats, default=str)}\n"
    if salary_stats:
        prompt += f"Salary statistics: {json.dumps(salary_stats, default=str)}\n"
    if charts_summary:
        prompt += f"\nCharts computed ({len(charts_summary)} total):\n"
        prompt += json.dumps(charts_summary, indent=2, default=str)
    prompt += (
        "\n\nWrite a clear, insightful executive summary of what this data reveals. "
        "Include specific numbers and end with concrete recommendations."
    )

    return await provider.complete(_SYSTEM, prompt)
