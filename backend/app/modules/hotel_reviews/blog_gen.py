"""Auto-generate a blog post from a completed crawl session using the LLM."""

from __future__ import annotations

from typing import Any

from app.modules.agents.llm import LLMProvider


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
    stats_text = "; ".join(f"{k}: avg={v.get('avg')}, max={v.get('max')}" for k, v in stats.items())

    system = (
        "You are a technical blog writer for a data engineering portfolio site. "
        "Write in an engaging, professional tone. Be specific about technology choices."
    )
    prompt = f"""
Write a blog post about this completed data-engineering project:

PROJECT: Web Crawling & Analytics Platform
URL crawled: {session_data.get("target_url", "a commercial website")}
Goal: {session_data.get("collection_prompt", "collect and analyse web data")}
Records collected: {total}
Analytics computed: {chart_summaries}
Key stats: {stats_text}

TECHNOLOGIES USED:
- Playwright (headless Chromium) for browser automation
- Groq AI (llama-3.3-70b-versatile) for LLM-guided navigation and extraction
- FastAPI + SQLAlchemy for backend orchestration
- Next.js + Recharts for frontend visualization
- Self-healing: LLM detects when selectors break and proposes fixes

STRUCTURE: Write the blog post with the following sections:
1. Title (catchy, specific to the data collected)
2. Introduction: what the project does and why it matters
3. How It Works: the LLM-guided crawling pipeline
4. Technical Deep Dive: Playwright + Groq integration, self-healing mechanism
5. Insights from the Data: mention the actual stats/charts
6. Why This Approach: trade-offs, benefits over manual scraping
7. Conclusion: what was learned

Return a JSON object with:
- "title": blog post title (max 80 chars)
- "slug": URL slug (kebab-case)
- "category": "Data Engineering"
- "tags": list of 3-5 tags
- "excerpt": 2-sentence summary
- "content": full markdown content (minimum 600 words)
"""
    result = await provider.propose_json(system, prompt, fallback={
        "title": "Building an LLM-Guided Web Crawler with Playwright and Groq",
        "slug": "llm-guided-web-crawler-playwright-groq",
        "category": "Data Engineering",
        "tags": ["Playwright", "Groq", "Web Crawling", "FastAPI", "Data Engineering"],
        "excerpt": "An intelligent web crawling engine that uses Groq AI to navigate and extract structured data from any website, with self-healing capabilities.",
        "content": f"# LLM-Guided Web Crawler\n\nThis project demonstrates how to combine Playwright browser automation with Groq AI for intelligent web data extraction.\n\n## Overview\n\nCrawled {total} records from the target site, computing {len(charts)} analytics charts.\n\n## Technology Stack\n\n- **Playwright**: Headless Chromium automation\n- **Groq AI**: LLM-guided navigation\n- **FastAPI**: Backend API\n- **Next.js + Recharts**: Frontend visualization",
    })
    return result
