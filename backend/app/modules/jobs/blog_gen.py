"""Auto-generate a job-market trend blog post from a completed crawl session."""

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
    total = session_data.get("total_records", analytics.get("total_records", 0))
    charts = analytics.get("charts", [])
    chart_summaries = "; ".join(c.get("title", "") for c in charts[:6])
    salary_stats = analytics.get("salary_stats", {})
    unique_skills = analytics.get("unique_skills", 0)

    salary_text = ""
    if salary_stats:
        salary_text = (
            f"avg ${salary_stats.get('avg', 0):,.0f}, "
            f"range ${salary_stats.get('min', 0):,.0f}–${salary_stats.get('max', 0):,.0f} "
            f"(from {salary_stats.get('count', 0)} listings with salary data)"
        )

    # Pull top 5 skills for the prompt
    skill_chart = next((c for c in charts if c.get("id") == "skill_demand"), None)
    top_skills_text = ""
    if skill_chart:
        top5 = skill_chart.get("data", [])[:5]
        top_skills_text = ", ".join(f"{d.get('skill')} ({d.get('count')})" for d in top5)

    system = (
        "You are a data-driven blog writer for a software engineering portfolio. "
        "Write concisely with specific numbers. Reference the data provided. "
        "You MUST respond with a valid JSON object only — no prose before or after."
    )
    prompt = f"""Write a job-market trends blog post based on real scraped data. Return JSON only.

DATA SUMMARY:
- Source: {session_data.get("target_url", "a job board")}
- Query / goal: {session_data.get("collection_prompt", "analyse the job market")}
- Job listings collected: {total}
- Unique skills identified: {unique_skills}
- Top skills: {top_skills_text or "see analytics"}
- Salary data: {salary_text or "not available in this dataset"}
- Analytics available: {chart_summaries or "skill demand, salary distribution, location, seniority"}

TECHNOLOGIES USED: Playwright (headless browser), Groq AI (llama-3.3-70b-versatile),
FastAPI + SQLAlchemy, Next.js + Recharts, Python analytics engine.

Return exactly this JSON structure:
{{
  "title": "<specific data-driven title, e.g. 'Python Engineer Jobs: {total} Listings Analysed — What the Data Shows'>",
  "slug": "<kebab-case-url-slug, max 60 chars>",
  "excerpt": "<2-sentence summary using specific numbers from the data>",
  "content": "<full markdown post, minimum 400 words. Sections: Introduction, Methodology, Top Skills in Demand, Salary Landscape, Work Arrangement Trends, Key Takeaways. Be specific — cite numbers from the data.>"
}}"""

    raw = await provider.complete(system, prompt)
    result = _parse_json_from_text(raw) if raw else None

    if not result or not result.get("title"):
        result = {
            "title": f"Job Market Analysis: {total} Listings from {session_data.get('target_url', 'a Job Board')}",
            "slug": f"job-market-{re.sub(r'[^a-z0-9-]', '-', (session_data.get('target_url') or '').lower().replace('https://', ''))[:35]}-{total}",
            "excerpt": (
                f"We analysed {total} job listings using Playwright and Groq AI, identifying "
                f"{unique_skills} unique skills in demand."
            ),
            "content": (
                f"# Job Market Analytics\n\n"
                f"This analysis collected **{total} job listings** from "
                f"`{session_data.get('target_url', 'the target site')}`.\n\n"
                f"## Goal\n\n{session_data.get('collection_prompt', '')}\n\n"
                f"## Analytics Computed\n\n{chart_summaries or 'See the analytics dashboard.'}\n\n"
                + (
                    f"## Salary Insights\n\nAverage salary: **${salary_stats.get('avg', 0):,.0f}**\n\n"
                    if salary_stats
                    else ""
                )
                + "## Technology Stack\n\n"
                "- **Playwright**: Headless browser automation\n"
                "- **Groq AI**: LLM-guided data extraction and skill parsing\n"
                "- **FastAPI + SQLAlchemy**: Backend orchestration\n"
                "- **Next.js + Recharts**: Analytics dashboard\n"
            ),
        }

    return result
