"""Playwright-based intelligent web crawler with LLM-guided navigation."""

from __future__ import annotations

import asyncio
import re
from typing import Any

from app.core.logging import get_logger
from app.modules.agents.llm import LLMProvider

log = get_logger("hotel_reviews.engine")

_MAX_HTML_CHARS = 8000  # truncate page HTML sent to LLM


def _clean_html(html: str) -> str:
    """Strip scripts/styles, collapse whitespace, truncate."""
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"\s+", " ", html).strip()
    return html[:_MAX_HTML_CHARS]


class CrawlEngine:
    """LLM-guided Playwright crawler.

    Strategy:
      1. Load the start URL.
      2. Ask the LLM for an extraction plan (what CSS selectors to use).
      3. Extract data from the current page.
      4. Ask the LLM for the "next page" selector if more pages needed.
      5. Repeat up to max_pages.
      6. If an extraction step yields 0 results, ask LLM for a healing strategy.
    """

    def __init__(self, provider: LLMProvider, *, max_pages: int = 5) -> None:
        self.provider = provider
        self.max_pages = max_pages

    async def run(
        self,
        start_url: str,
        collection_prompt: str,
        *,
        on_record: Any = None,  # async callable(record: dict, url: str)
        on_progress: Any = None,  # async callable(msg: str)
    ) -> list[dict[str, Any]]:
        """Run the crawl. Returns list of extracted records."""
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            log.warning("playwright not installed — returning empty")
            return []

        records: list[dict[str, Any]] = []

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                )
            )
            page = await context.new_page()

            try:
                if on_progress:
                    await on_progress(f"Loading {start_url}")
                await page.goto(start_url, wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(2)  # let JS settle

                plan = await self._get_extraction_plan(
                    await page.content(), start_url, collection_prompt
                )
                if on_progress:
                    await on_progress(f"Extraction plan: {plan.get('strategy', 'direct scrape')}")

                for page_num in range(self.max_pages):
                    url = page.url
                    if on_progress:
                        await on_progress(f"Extracting page {page_num + 1}: {url}")

                    html = await page.content()
                    page_records = await self._extract_records(html, url, collection_prompt, plan)

                    if not page_records and page_num == 0:
                        # Try healing on first page
                        if on_progress:
                            await on_progress("No records found — requesting healing strategy")
                        plan = await self._heal(html, url, collection_prompt, plan)
                        page_records = await self._extract_records(html, url, collection_prompt, plan)

                    for rec in page_records:
                        records.append(rec)
                        if on_record:
                            await on_record(rec, url)

                    if on_progress:
                        await on_progress(f"Page {page_num + 1}: extracted {len(page_records)} records (total: {len(records)})")

                    # Navigate to next page
                    if page_num < self.max_pages - 1:
                        navigated = await self._go_next(page, html, plan)
                        if not navigated:
                            if on_progress:
                                await on_progress("No next page — crawl complete")
                            break
                        await asyncio.sleep(2)

            finally:
                await context.close()
                await browser.close()

        return records

    async def _get_extraction_plan(
        self, html: str, url: str, collection_prompt: str
    ) -> dict[str, Any]:
        system = (
            "You are a web scraping expert. Analyze the page content and create an extraction plan. "
            "Return JSON only."
        )
        prompt = f"""
URL: {url}
User wants: {collection_prompt}

Page content (truncated):
{_clean_html(html)}

Return a JSON extraction plan with these keys:
- "strategy": brief description of approach
- "item_selector": CSS selector for each listing/item container (e.g. "[data-testid='property-card']")
- "fields": object mapping field_name -> CSS selector relative to item (e.g. {{"name": "h2", "price": ".price", "rating": "[aria-label*='Scored']"}})
- "next_page_selector": CSS selector for next page button (or null if single page)
- "data_type": what kind of data this is (hotel, review, property, etc.)
"""
        return await self.provider.propose_json(system, prompt, fallback={
            "strategy": "generic scrape",
            "item_selector": "article, .card, [data-testid*='card'], .property, li.item",
            "fields": {"title": "h2, h3, .title", "description": "p", "price": ".price, [data-testid*='price']", "rating": ".rating, [aria-label*='core']"},
            "next_page_selector": "[aria-label='Next page'], .next-page, button[data-testid='pagination-next']",
            "data_type": "item",
        })

    async def _extract_records(
        self, html: str, url: str, collection_prompt: str, plan: dict[str, Any]
    ) -> list[dict[str, Any]]:
        system = (
            "You are a data extraction expert. Extract structured records from this HTML. "
            "Return JSON only — a list of records."
        )
        fields_desc = ", ".join(f"{k}: {v}" for k, v in (plan.get("fields") or {}).items())
        prompt = f"""
URL: {url}
Extraction goal: {collection_prompt}
Item selector: {plan.get('item_selector', 'any relevant container')}
Fields to extract: {fields_desc}

Page HTML (truncated):
{_clean_html(html)}

Return a JSON object with key "records": a list of objects, each with the extracted fields.
Include source_url field set to "{url}" on each record.
Extract up to 25 records from this page.
"""
        result = await self.provider.propose_json(system, prompt, fallback={"records": []})
        records = result.get("records", [])
        if isinstance(records, list):
            return [r for r in records if isinstance(r, dict)]
        return []

    async def _heal(
        self, html: str, url: str, collection_prompt: str, plan: dict[str, Any]
    ) -> dict[str, Any]:
        system = "You are debugging a web scraper. The current selectors returned 0 results. Return JSON only."
        prompt = f"""
URL: {url}
Goal: {collection_prompt}
Failed plan: {plan}
Page HTML: {_clean_html(html)}

The selectors above returned no items. Analyze the page and provide a corrected extraction plan with the same structure.
"""
        return await self.provider.propose_json(system, prompt, fallback=plan)

    async def _go_next(self, page: Any, html: str, plan: dict[str, Any]) -> bool:
        """Try to navigate to the next page. Returns True if successful."""
        selector = plan.get("next_page_selector")
        if not selector:
            return False
        try:
            el = await page.query_selector(selector)
            if el:
                await el.click()
                await page.wait_for_load_state("domcontentloaded", timeout=15000)
                return True
        except Exception as e:
            log.debug("next_page.failed", error=str(e))
        return False
