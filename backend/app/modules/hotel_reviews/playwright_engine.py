"""Playwright-based intelligent web crawler with LLM-guided navigation."""

from __future__ import annotations

import asyncio
import re
from typing import Any

from app.core.logging import get_logger
from app.modules.agents.llm import LLMProvider

log = get_logger("hotel_reviews.engine")

_MAX_HTML_CHARS = 20000  # truncate page HTML sent to LLM

# Common cookie/consent banner selectors tried before falling back to LLM
_COOKIE_SELECTORS = [
    # OneTrust
    "#onetrust-accept-btn-handler",
    "#accept-recommended-btn-handler",
    # Cookiebot
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept",
    # Booking.com
    '[data-testid="accept-cookie-button"]',
    # Generic text-based (aria / visible text)
    "button:has-text('Accept all')",
    "button:has-text('Accept All')",
    "button:has-text('Accept All Cookies')",
    "button:has-text('Accept cookies')",
    "button:has-text('Accept')",
    "button:has-text('Agree')",
    "button:has-text('I agree')",
    "button:has-text('Allow all')",
    "button:has-text('Allow All')",
    "button:has-text('Got it')",
    "button:has-text('OK')",
    "button:has-text('Confirm')",
    # Common class patterns
    ".cc-btn.cc-allow",
    ".cc-accept",
    "[class*='cookie'] button[class*='accept']",
    "[class*='consent'] button[class*='accept']",
    "[data-action='accept-cookies']",
    "[data-testid*='cookie'][data-testid*='accept']",
    "[aria-label*='Accept'][aria-label*='cookie' i]",
    "[aria-label*='Accept all']",
]


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
      2. Dismiss any cookie/consent banner (known patterns → LLM fallback).
      3. Ask the LLM for an extraction plan (CSS selectors).
      4. Extract data from the current page.
      5. Ask the LLM for the "next page" selector if more pages needed.
      6. Repeat up to max_pages.
      7. If an extraction step yields 0 results, ask LLM for a healing strategy.
    """

    def __init__(self, provider: LLMProvider, *, max_pages: int = 5) -> None:
        self.provider = provider
        self.max_pages = max_pages

    async def run(
        self,
        start_url: str,
        collection_prompt: str,
        *,
        on_record: Any = None,
        on_progress: Any = None,
        cookie_hints: str | None = None,
    ) -> list[dict[str, Any]]:
        """Run the crawl. Returns list of extracted records.

        cookie_hints: optional extra context from the user about this site's
        cookie popup (e.g. 'The site has a button labeled "Akkoord"').
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            log.error("playwright.not_installed", remedy="Add playwright to requirements.txt and run playwright install chromium in the Docker image")
            if on_progress:
                await on_progress("ERROR: Playwright is not installed in this environment. Please contact the administrator.")
            return []

        records: list[dict[str, Any]] = []

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
            )
            page = await context.new_page()

            try:
                if on_progress:
                    await on_progress(f"Loading {start_url}")
                await page.goto(start_url, wait_until="load", timeout=45000)
                # Give JS frameworks time to render and lazy-load content
                await asyncio.sleep(3)
                # Scroll to bottom to trigger lazy-loaded items, then back up
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)
                await page.evaluate("window.scrollTo(0, 0)")

                # --- Cookie banner dismissal ---
                dismissed, cookie_status = await self._dismiss_cookie_banner(
                    page, cookie_hints=cookie_hints
                )
                if on_progress:
                    await on_progress(f"Cookie banner: {cookie_status}")
                if not dismissed:
                    if on_progress:
                        await on_progress(
                            "WARNING: Could not auto-dismiss cookie banner. "
                            "If you see incomplete data, visit the site manually to identify "
                            "the 'Accept' button text and pass it as a cookie hint on the next run."
                        )

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

                    # Try DOM-direct extraction first (fast, accurate for JS-rendered sites)
                    page_records = await self._extract_with_playwright(page, plan, url)
                    if on_progress:
                        await on_progress(
                            f"DOM extraction: {len(page_records)} records"
                            + (" — falling back to LLM" if not page_records else "")
                        )

                    # Fall back to LLM-based extraction if DOM gave nothing
                    if not page_records:
                        page_records = await self._extract_records(html, url, collection_prompt, plan)

                    if not page_records and page_num == 0:
                        if on_progress:
                            await on_progress("No records found — requesting healing strategy")
                        plan = await self._heal(html, url, collection_prompt, plan)
                        page_records = await self._extract_with_playwright(page, plan, url)
                        if not page_records:
                            page_records = await self._extract_records(html, url, collection_prompt, plan)

                    for rec in page_records:
                        records.append(rec)
                        if on_record:
                            await on_record(rec, url)

                    if on_progress:
                        await on_progress(
                            f"Page {page_num + 1}: extracted {len(page_records)} records "
                            f"(total: {len(records)})"
                        )

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

    async def _dismiss_cookie_banner(
        self, page: Any, *, cookie_hints: str | None = None
    ) -> tuple[bool, str]:
        """Try to dismiss a cookie consent banner.

        Returns (dismissed: bool, status_message: str).
        First tries known CSS/text selectors, then an LLM-proposed selector,
        then a user-supplied hint if provided.
        """
        # 1. Try well-known selectors
        for sel in _COOKIE_SELECTORS:
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(1)
                    log.debug("cookie_banner.dismissed", selector=sel)
                    return True, f"dismissed via known selector ({sel})"
            except Exception:
                continue

        # 2. User-supplied hint (extra button text or selector from a previous run)
        if cookie_hints:
            try:
                hint_sel = (
                    cookie_hints
                    if cookie_hints.startswith(("#", ".", "[", "button"))
                    else f"button:has-text('{cookie_hints}')"
                )
                el = await page.query_selector(hint_sel)
                if el and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(1)
                    return True, f"dismissed via user hint ({hint_sel})"
            except Exception:
                pass

        # 3. LLM fallback — look for cookie-related dialog in page text
        html_sample = _clean_html(await page.content())
        cookie_keywords = ["cookie", "consent", "privacy", "gdpr", "tracking"]
        has_cookie_text = any(kw in html_sample.lower() for kw in cookie_keywords)
        if not has_cookie_text:
            return True, "no cookie banner detected"

        system = "You are helping dismiss a cookie consent banner on a webpage. Return JSON only."
        prompt = f"""
The following page text contains cookie/consent language. Identify the CSS selector or
button text for the 'Accept' or 'Agree' button that dismisses the banner.

Page content snippet:
{html_sample[:3000]}

Return JSON: {{"selector": "<css_selector_or_null>", "button_text": "<visible_text_or_null>", "found": true|false}}
If you cannot identify the button with confidence, set found=false.
"""
        result = await self.provider.propose_json(
            system, prompt, fallback={"selector": None, "button_text": None, "found": False}
        )

        if result.get("found"):
            sel = result.get("selector")
            btn_text = result.get("button_text")
            try:
                el = None
                if sel:
                    el = await page.query_selector(sel)
                if not el and btn_text:
                    el = await page.query_selector(f"button:has-text('{btn_text}')")
                if el and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(1)
                    return True, f"dismissed via LLM suggestion ({sel or btn_text})"
            except Exception as exc:
                log.debug("cookie_banner.llm_click_failed", error=str(exc))

        return False, (
            "could not dismiss cookie banner automatically — "
            "try passing a cookie hint like the accept button text for this site"
        )

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
- "fields": object mapping field_name -> CSS selector relative to item
- "next_page_selector": CSS selector for next page button (or null if single page)
- "data_type": what kind of data this is (hotel, review, property, etc.)
"""
        return await self.provider.propose_json(system, prompt, fallback={
            "strategy": "generic scrape",
            "item_selector": "article, .card, [data-testid*='card'], .property, li.item",
            "fields": {
                "title": "h2, h3, .title",
                "description": "p",
                "price": ".price, [data-testid*='price']",
                "rating": ".rating, [aria-label*='core']",
            },
            "next_page_selector": "[aria-label='Next page'], .next-page, button[data-testid='pagination-next']",
            "data_type": "item",
        })

    async def _extract_with_playwright(
        self, page: Any, plan: dict[str, Any], url: str
    ) -> list[dict[str, Any]]:
        """Use the browser DOM directly to extract records via CSS selectors.

        Much more reliable than sending cleaned HTML to the LLM for JS-rendered
        sites (Booking.com, Amazon, etc.) where content is injected at runtime.
        Falls back gracefully to [] on any error so the LLM path remains intact.
        """
        item_sel = plan.get("item_selector", "")
        fields: dict[str, str] = plan.get("fields") or {}
        if not item_sel or not fields:
            return []

        js = """
        ({item_selector, fields, source_url}) => {
            const items = Array.from(document.querySelectorAll(item_selector)).slice(0, 25);
            return items.map(item => {
                const rec = {source_url};
                for (const [field, sel] of Object.entries(fields)) {
                    const el = item.querySelector(sel);
                    if (el) {
                        const text = (el.textContent || el.getAttribute('aria-label') ||
                                      el.getAttribute('title') || el.getAttribute('content') || '').trim();
                        rec[field] = text || null;
                    } else {
                        rec[field] = null;
                    }
                }
                return rec;
            }).filter(r => Object.values(r).some(v => v && v !== source_url));
        }
        """
        try:
            results = await page.evaluate(js, {
                "item_selector": item_sel,
                "fields": fields,
                "source_url": url,
            })
            if isinstance(results, list):
                return [r for r in results if isinstance(r, dict)]
        except Exception as exc:
            log.debug("playwright_extract.failed", error=str(exc))
        return []

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

The selectors above returned no items. Analyze the page and provide a corrected extraction plan
with the same JSON structure as the original plan.
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
