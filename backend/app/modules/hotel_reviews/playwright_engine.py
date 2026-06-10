"""Playwright-based intelligent web crawler with LLM-guided navigation."""

from __future__ import annotations

import asyncio
import re
from typing import Any

from app.core.logging import get_logger
from app.modules.agents.llm import LLMProvider

log = get_logger("hotel_reviews.engine")

_MAX_HTML_CHARS = 50_000  # HTML-with-tags for selector planning
_MAX_TEXT_CHARS = 20_000  # stripped text for LLM content extraction

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
    # Dutch / German
    "button:has-text('Akkoord')",
    "button:has-text('Alle akkoord')",
    "button:has-text('Alle cookies accepteren')",
    "button:has-text('Zustimmen')",
    "button:has-text('Alle akzeptieren')",
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

# Stable attributes useful for CSS selector generation
_KEEP_ATTRS_RE = re.compile(
    r'(?:id|class|role|href|name|type|data-[a-z][a-z0-9-]*|aria-[a-z][a-z0-9-]*)="[^"]*"',
    re.IGNORECASE,
)


def _clean_html_for_plan(html: str) -> str:
    """Preserve HTML structure (tags + stable attrs) for LLM selector planning.

    Strips script/style/svg entirely; keeps id, class, data-*, aria-* and role
    so the LLM can propose accurate CSS selectors against the live DOM.
    """
    # Remove entire block elements that add noise
    html = re.sub(
        r"<(script|style|noscript|svg|meta|link)[^>]*>.*?</\1>",
        "",
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)

    def _strip_attrs(m: re.Match) -> str:
        full = m.group(0)
        tag_name = re.match(r"<[A-Za-z][A-Za-z0-9]*", full)
        if not tag_name:
            return full
        kept = _KEEP_ATTRS_RE.findall(full)
        closing = " />" if full.rstrip().endswith("/>") else ">"
        return f"{tag_name.group(0)}{(' ' + ' '.join(kept)) if kept else ''}{closing}"

    html = re.sub(r"<[A-Za-z][^>]*?>", _strip_attrs, html)
    html = re.sub(r"\s+", " ", html).strip()
    return html[:_MAX_HTML_CHARS]


def _clean_html_for_text(html: str) -> str:
    """Strip all HTML tags, keep just text content for LLM extraction fallback."""
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"\s+", " ", html).strip()
    return html[:_MAX_TEXT_CHARS]


def _record_key(rec: dict) -> str:
    """Stable dedup key so scroll-loaded duplicates are dropped."""
    title = str(rec.get("title") or rec.get("name") or rec.get("property_name") or "")
    price = str(rec.get("price") or rec.get("price_per_night") or "")
    url = str(rec.get("source_url") or "")
    return f"{title}|{price}|{url}"


class CrawlEngine:
    """LLM-guided Playwright crawler.

    Strategy:
      1. Load the start URL.
      2. Dismiss any cookie/consent banner (known patterns → LLM fallback).
      3. Ask the LLM for an extraction plan with HTML-structure context.
      4. DOM-direct extraction first (fast, accurate for JS-rendered sites).
      5. LLM text-extraction fallback if DOM yields nothing.
      6. Navigate to next page via button click OR infinite scroll.
      7. Deduplicate records (for scroll-loaded sites).
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
        selector_hints: dict[str, str] | None = None,
        pagination_type: str = "auto",
    ) -> list[dict[str, Any]]:
        """Run the crawl. Returns list of extracted records.

        pagination_type: "auto" (try button then scroll), "scroll" (infinite scroll only),
                         "click" (button/link only).
        selector_hints: user-provided {field: css_selector_or_description} overrides.
        cookie_hints: optional text/selector for this site's cookie accept button.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            log.error("playwright.not_installed")
            if on_progress:
                await on_progress("ERROR: Playwright is not installed.")
            return []

        records: list[dict[str, Any]] = []
        seen_keys: set[str] = set()

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
                await asyncio.sleep(3)
                # Scroll to trigger lazy content, then back to top
                await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)
                await page.evaluate("() => window.scrollTo(0, 0)")
                await asyncio.sleep(1)

                # --- Cookie banner dismissal ---
                dismissed, cookie_status = await self._dismiss_cookie_banner(
                    page, cookie_hints=cookie_hints
                )
                if on_progress:
                    await on_progress(f"Cookie banner: {cookie_status}")
                if not dismissed and on_progress:
                    await on_progress(
                        "WARNING: Could not dismiss cookie banner automatically. "
                        "If data is incomplete, re-run with the accept button text as a cookie hint."
                    )

                # --- Extraction plan (uses HTML-with-tags for accurate selectors) ---
                plan = await self._get_extraction_plan(
                    await page.content(), start_url, collection_prompt
                )
                if selector_hints:
                    plan["fields"] = {**(plan.get("fields") or {}), **selector_hints}
                if on_progress:
                    await on_progress(
                        f"Plan: {plan.get('strategy', 'direct scrape')} | "
                        f"pagination: {plan.get('pagination_hint', pagination_type)}"
                    )

                # Honour LLM's pagination hint if user left it on "auto"
                effective_pagination = pagination_type
                if effective_pagination == "auto":
                    llm_hint = plan.get("pagination_hint", "")
                    if "scroll" in llm_hint.lower():
                        effective_pagination = "scroll"

                for page_num in range(self.max_pages):
                    url = page.url
                    if on_progress:
                        await on_progress(f"Extracting page {page_num + 1}: {url}")

                    html = await page.content()

                    # DOM-direct first
                    page_records = await self._extract_with_playwright(page, plan, url)
                    if on_progress:
                        await on_progress(
                            f"DOM extraction: {len(page_records)} records"
                            + (" — falling back to LLM" if not page_records else "")
                        )

                    # LLM text-extraction fallback
                    if not page_records:
                        page_records = await self._extract_records(
                            html, url, collection_prompt, plan
                        )

                    # Heal plan if first page yields nothing
                    if not page_records and page_num == 0:
                        if on_progress:
                            await on_progress("No records found — requesting healed plan")
                        plan = await self._heal(html, url, collection_prompt, plan)
                        if selector_hints:
                            plan["fields"] = {**(plan.get("fields") or {}), **selector_hints}
                        page_records = await self._extract_with_playwright(page, plan, url)
                        if not page_records:
                            page_records = await self._extract_records(
                                html, url, collection_prompt, plan
                            )

                    # Deduplicate (handles scroll overlap)
                    new_count = 0
                    for rec in page_records:
                        key = _record_key(rec)
                        if key in seen_keys:
                            continue
                        seen_keys.add(key)
                        records.append(rec)
                        new_count += 1
                        if on_record:
                            await on_record(rec, url)

                    if on_progress:
                        await on_progress(
                            f"Page {page_num + 1}: {new_count} new records "
                            f"(total: {len(records)})"
                        )

                    if page_num < self.max_pages - 1:
                        navigated = await self._go_next(
                            page, html, plan, pagination_type=effective_pagination
                        )
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
        """Try to dismiss a cookie consent banner."""
        for sel in _COOKIE_SELECTORS:
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(1)
                    return True, f"dismissed via known selector ({sel})"
            except Exception:
                continue

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

        html_sample = _clean_html_for_text(await page.content())
        cookie_keywords = ["cookie", "consent", "privacy", "gdpr", "tracking"]
        if not any(kw in html_sample.lower() for kw in cookie_keywords):
            return True, "no cookie banner detected"

        system = "You are helping dismiss a cookie consent banner. Return JSON only."
        prompt = f"""
Page content (text):
{html_sample[:3000]}

Return JSON: {{"selector": "<css_or_null>", "button_text": "<text_or_null>", "found": true|false}}
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
            "could not dismiss cookie banner — try passing the accept button text as a cookie hint"
        )

    async def _get_extraction_plan(
        self, html: str, url: str, collection_prompt: str
    ) -> dict[str, Any]:
        system = (
            "You are a web scraping expert. Analyze the page HTML and create a precise "
            "extraction plan. Return JSON only."
        )
        cleaned = _clean_html_for_plan(html)
        prompt = f"""
URL: {url}
User wants to collect: {collection_prompt}

The HTML below preserves tag structure and attributes (id, class, data-*, aria-*).
Use this to identify the MOST STABLE CSS selectors — prefer:
1. data-testid="..." attributes (most stable)
2. aria-label="..." attributes
3. id="..." attributes
4. Semantic tags with role attributes
5. Class names only as a last resort (avoid random-looking hash classes)

Every field the user mentioned MUST appear in the "fields" map. Use your best guess
for the selector even if uncertain — use the most descriptive attribute you can find.

Page HTML (structure preserved):
{cleaned}

Return JSON:
{{
  "strategy": "one-sentence description of what kind of page this is",
  "item_selector": "CSS selector matching EACH individual listing/card/item (e.g. [data-testid='property-card'])",
  "fields": {{
    "<snake_case_field>": "<CSS selector relative to the item container>",
    ...one entry per requested field...
  }},
  "next_page_selector": "CSS selector for the Next Page button/link, or null",
  "pagination_hint": "scroll|click|unknown — whether the site uses infinite scroll or button pagination",
  "data_type": "hotel|product|review|property|listing|etc",
  "requested_fields": ["exact", "field", "names", "user", "wants"]
}}
"""
        return await self.provider.propose_json(system, prompt, fallback={
            "strategy": "generic scrape",
            "item_selector": (
                "[data-testid*='card'], [data-testid*='property'], "
                "article, .card, li.item"
            ),
            "fields": {
                "title": "[data-testid='title'], h2, h3",
                "price": "[data-testid*='price'], .price",
                "rating": "[data-testid='review-score'], [aria-label*='rating'], [aria-label*='score']",
                "location": "[data-testid='address'], address, [aria-label*='location']",
                "description": "p",
            },
            "next_page_selector": "[aria-label='Next page'], button[data-testid='pagination-next']",
            "pagination_hint": "unknown",
            "data_type": "item",
            "requested_fields": [],
        })

    async def _extract_with_playwright(
        self, page: Any, plan: dict[str, Any], url: str
    ) -> list[dict[str, Any]]:
        """DOM-direct extraction — reliable for JS-rendered sites.

        For each field, tries the primary selector AND a set of common fallback
        patterns so partial plans still capture most data.
        """
        item_sel = plan.get("item_selector", "")
        fields: dict[str, str] = plan.get("fields") or {}
        if not item_sel or not fields:
            return []

        # Build fallback selectors for common field names
        fallbacks: dict[str, list[str]] = {
            "title": ["[data-testid='title']", "h2", "h3", ".title"],
            "price": [
                "[data-testid='price-and-discounted-price']",
                "[data-testid*='price']",
                ".price",
                "[class*='price']",
                "[aria-label*='price' i]",
            ],
            "rating": [
                "[data-testid='review-score']",
                "[aria-label*='rating' i]",
                "[aria-label*='score' i]",
                ".rating",
                "[class*='rating']",
                "[class*='review-score']",
            ],
            "location": [
                "[data-testid='address']",
                "address",
                "[aria-label*='location' i]",
                "[aria-label*='address' i]",
                "[class*='location']",
                "[class*='address']",
            ],
            "description": ["p", "[data-testid='description']", ".description"],
        }

        # Merge plan selectors as the first option for each field
        full_selectors: dict[str, list[str]] = {}
        for field, sel in fields.items():
            opts = [sel] if sel else []
            for fb_key, fb_sels in fallbacks.items():
                if fb_key in field.lower():
                    opts = opts + [s for s in fb_sels if s != sel]
                    break
            full_selectors[field] = opts

        js = """
        ({item_selector, selectors, source_url}) => {
            const items = Array.from(document.querySelectorAll(item_selector)).slice(0, 30);
            return items.map(item => {
                const rec = {source_url};
                for (const [field, sels] of Object.entries(selectors)) {
                    let val = null;
                    for (const sel of sels) {
                        try {
                            const el = item.querySelector(sel);
                            if (el) {
                                val = (
                                    el.textContent ||
                                    el.getAttribute('aria-label') ||
                                    el.getAttribute('title') ||
                                    el.getAttribute('content') ||
                                    ''
                                ).trim();
                                if (val) break;
                            }
                        } catch(e) { continue; }
                    }
                    rec[field] = val || null;
                }
                return rec;
            }).filter(r =>
                Object.entries(r).some(([k, v]) => k !== 'source_url' && v)
            );
        }
        """
        try:
            results = await page.evaluate(js, {
                "item_selector": item_sel,
                "selectors": full_selectors,
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
            "You are a data extraction expert. Extract structured records from page text. "
            "Use null for missing fields. Return JSON only."
        )
        requested = plan.get("requested_fields") or list((plan.get("fields") or {}).keys())
        fields_list = ", ".join(f'"{f}"' for f in requested) if requested else "all relevant fields"
        prompt = f"""
URL: {url}
Collection goal: {collection_prompt}
Required fields per record: [{fields_list}]

Page text:
{_clean_html_for_text(html)}

Extract every listing visible. Each object MUST have ALL required fields (null if absent).
Include "source_url": "{url}" on every record.

Return: {{"records": [{{...}}, ...]}}
Extract up to 30 records.
"""
        result = await self.provider.propose_json(system, prompt, fallback={"records": []})
        records = result.get("records", [])
        if isinstance(records, list):
            return [r for r in records if isinstance(r, dict)]
        return []

    async def _heal(
        self, html: str, url: str, collection_prompt: str, plan: dict[str, Any]
    ) -> dict[str, Any]:
        system = "You are debugging a web scraper. The current plan returned 0 results. Return JSON only."
        prompt = f"""
URL: {url}
Goal: {collection_prompt}
Failed plan: {plan}

Page HTML (structure preserved, attributes kept):
{_clean_html_for_plan(html)}

The selectors returned no items. Provide a CORRECTED extraction plan with the same JSON
structure. Focus on data-testid, aria-label, and id attributes for maximum stability.
"""
        return await self.provider.propose_json(system, prompt, fallback=plan)

    async def _go_next(
        self, page: Any, html: str, plan: dict[str, Any], *, pagination_type: str = "auto"
    ) -> bool:
        """Navigate to the next page/batch of results.

        Tries button/link click first, then scroll-based infinite loading.
        """
        selector = plan.get("next_page_selector")

        # 1. Button/link click
        if selector and pagination_type in ("auto", "click"):
            try:
                el = await page.query_selector(selector)
                if el and await el.is_visible():
                    await el.click()
                    await page.wait_for_load_state("domcontentloaded", timeout=15000)
                    await asyncio.sleep(2)
                    return True
            except Exception as e:
                log.debug("next_page.click_failed", error=str(e))

        # 2. Infinite-scroll — detect if page grows after scrolling to bottom
        if pagination_type in ("auto", "scroll"):
            try:
                prev_height = await page.evaluate("() => document.body.scrollHeight")
                prev_count = await page.evaluate(
                    f"() => document.querySelectorAll({repr(plan.get('item_selector', 'article'))}).length"
                )
                await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(3)
                new_height = await page.evaluate("() => document.body.scrollHeight")
                new_count = await page.evaluate(
                    f"() => document.querySelectorAll({repr(plan.get('item_selector', 'article'))}).length"
                )
                if new_height > prev_height + 100 or new_count > prev_count:
                    log.debug("next_page.scroll_loaded", prev=prev_count, new=new_count)
                    return True
            except Exception as e:
                log.debug("next_page.scroll_failed", error=str(e))

        return False
