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

# ── Cookie / consent modal dismissal ────────────────────────────────────────
# Three-tier strategy:
#   1. Try every selector below (fast, zero LLM tokens).
#   2. JS brute-force scan (_COOKIE_DISMISS_JS) — scans all visible
#      buttons / clickable elements and clicks the first match.
#   3. LLM fallback — last resort, one call.

_COOKIE_SELECTORS: list[str] = [
    # ── Known vendor exact IDs ────────────────────────────────────────────
    "#onetrust-accept-btn-handler",
    "#accept-recommended-btn-handler",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept",
    "#cookie-accept", "#cookie_accept", "#cookieAccept",
    "#acceptCookies", "#accept-cookies", "#acceptAllCookies",
    "#btnAcceptAll", "#accept-all-cookies", "#acceptAll",
    "#close-cookies", "#dismiss-cookie-message", "#cookie-close",
    "#cookieConsentAccept", "#cookie-consent-accept",
    "#cookie_agree", "#cookieAgree", "#cookie-agree",
    # ── data-testid / data-action / data-* ───────────────────────────────
    '[data-testid="accept-cookie-button"]',
    '[data-testid="cookie-accept"]',
    '[data-testid*="cookie"][data-testid*="accept"]',
    '[data-testid*="consent"][data-testid*="accept"]',
    '[data-testid*="cookie"][data-testid*="allow"]',
    '[data-testid*="dismiss"]',
    '[data-testid*="cookie-close"]',
    '[data-action="accept-cookies"]',
    '[data-action="accept"]',
    '[data-action="dismiss"]',
    '[data-action="agree"]',
    '[data-action="allow"]',
    '[data-type="accept"]',
    '[data-cookie="accept"]',
    # ── aria-label patterns ───────────────────────────────────────────────
    '[aria-label*="Accept"][aria-label*="cookie" i]',
    '[aria-label*="Accept all" i]',
    '[aria-label*="Agree" i]',
    '[aria-label*="Dismiss cookie" i]',
    '[aria-label*="Close cookie" i]',
    '[aria-label="Dismiss"][role="button"]',
    # ── Keyword-in-id (buttons only) ─────────────────────────────────────
    'button[id*="accept"]', 'button[id*="Accept"]',
    'button[id*="agree"]',  'button[id*="Agree"]',
    'button[id*="allow"]',  'button[id*="Allow"]',
    'button[id*="dismiss"]', 'button[id*="Dismiss"]',
    'button[id*="consent"]', 'button[id*="cookie"]',
    # ── Keyword-in-class (buttons only) ──────────────────────────────────
    'button[class*="accept"]', 'button[class*="Accept"]',
    'button[class*="agree"]',  'button[class*="Agree"]',
    'button[class*="allow"]',  'button[class*="Allow"]',
    'button[class*="dismiss"]', 'button[class*="Dismiss"]',
    'button[class*="consent"]', 'button[class*="cookie"]',
    # ── Container + button patterns ───────────────────────────────────────
    ".cc-btn.cc-allow",
    ".cc-accept", ".cc-dismiss",
    "[class*='cookie'] button[class*='accept']",
    "[class*='cookie'] button[class*='allow']",
    "[class*='cookie'] button[class*='agree']",
    "[class*='consent'] button[class*='accept']",
    "[class*='gdpr'] button[class*='accept']",
    "[class*='privacy'] button[class*='accept']",
    "[class*='cookie-banner'] button",
    "[class*='cookie-notice'] button",
    "[class*='cookie-bar'] button",
    "[class*='cookie-popup'] button",
    "[class*='cookie-modal'] button",
    "[class*='cookie-overlay'] button",
    # ── Playwright text matchers (English) ────────────────────────────────
    "button:has-text('Accept all')",
    "button:has-text('Accept All')",
    "button:has-text('Accept All Cookies')",
    "button:has-text('Accept Cookies')",
    "button:has-text('Accept cookies')",
    "button:has-text('Accept & close')",
    "button:has-text('Accept and close')",
    "button:has-text('Accept')",
    "button:has-text('Agree')",
    "button:has-text('I agree')",
    "button:has-text('I Agree')",
    "button:has-text('Allow all')",
    "button:has-text('Allow All')",
    "button:has-text('Allow All Cookies')",
    "button:has-text('Allow cookies')",
    "button:has-text('Allow')",
    "button:has-text('Got it')",
    "button:has-text('Got It')",
    "button:has-text('OK')",
    "button:has-text('Ok')",
    "button:has-text('Confirm')",
    "button:has-text('Close')",
    "button:has-text('Dismiss')",
    "button:has-text('Reject all')",
    "button:has-text('Reject All')",
    "button:has-text('Reject')",
    "button:has-text('Refuse')",
    "button:has-text('Decline')",
    "button:has-text('Continue')",
    "button:has-text('Continue without accepting')",
    # ── Non-English ───────────────────────────────────────────────────────
    "button:has-text('Akkoord')",
    "button:has-text('Alle akkoord')",
    "button:has-text('Alle cookies accepteren')",
    "button:has-text('Accepteer')",
    "button:has-text('Zustimmen')",
    "button:has-text('Alle akzeptieren')",
    "button:has-text('Accepter')",
    "button:has-text('Accepter tout')",
    "button:has-text('Aceptar')",
    "button:has-text('Aceptar todo')",
    "button:has-text('Accetta')",
    "button:has-text('Accetta tutto')",
]

# JS brute-force modal/cookie dismissal.
# Priority order:
#   1. Buttons inside [role=dialog], [aria-modal], or cookie-named containers.
#   2. Any visible button whose text/id/class/aria-label contains dismiss keywords.
#   3. Any [role="button"] or [onclick] element matching dismiss + context keywords.
# Clicks the match directly in JS (avoids Playwright scroll/wait overhead),
# then the caller waits for the animation.
_COOKIE_DISMISS_JS = """
() => {
    const DISMISS_KWS = [
        'accept','agree','allow','consent','dismiss','close','got it','ok',
        'confirm','continue','yes','sure','reject','decline','refuse','deny',
        'no thanks','i agree','i accept','allow all','accept all'
    ];
    const CONTEXT_KWS = [
        'cookie','cookies','consent','privacy','gdpr','tracking','banner',
        'notice','modal','popup','overlay'
    ];

    function norm(s) { return (s || '').toLowerCase().trim(); }

    function isVisible(el) {
        try {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 5 && r.height > 5
                && s.visibility !== 'hidden'
                && s.display !== 'none'
                && parseFloat(s.opacity) > 0.05;
        } catch(e) { return false; }
    }

    function textOf(el) {
        return norm(el.innerText || el.textContent || el.value || '');
    }

    function attrsOf(el) {
        return norm([
            el.id,
            el.className,
            el.name,
            el.getAttribute('aria-label'),
            el.getAttribute('data-action'),
            el.getAttribute('data-testid'),
            el.getAttribute('data-cy'),
            el.getAttribute('data-dismiss'),
            el.getAttribute('title'),
            el.getAttribute('value'),
        ].join(' '));
    }

    function hasAny(text, list) { return list.some(kw => text.includes(kw)); }

    function tryClick(el, source) {
        try {
            el.click();
            return { clicked: true, text: textOf(el).slice(0, 80), source };
        } catch(e) { return null; }
    }

    // PRIORITY 1 — inside known dialog / consent containers
    const containers = [
        ...document.querySelectorAll(
            '[role="dialog"],[role="alertdialog"],[role="alert"],[aria-modal="true"]'
        ),
        ...document.querySelectorAll(
            '[class*="cookie"],[class*="consent"],[class*="gdpr"],' +
            '[class*="privacy"],[class*="banner"],[class*="modal"],' +
            '[id*="cookie"],[id*="consent"],[id*="gdpr"],' +
            '[id*="privacy"],[id*="banner"]'
        ),
    ];

    const seenContainers = new Set();
    for (const container of containers) {
        if (seenContainers.has(container) || !isVisible(container)) continue;
        seenContainers.add(container);
        const btns = container.querySelectorAll(
            'button,[role="button"],input[type="button"],input[type="submit"],' +
            '[onclick],[tabindex="0"]'
        );
        for (const btn of btns) {
            if (!isVisible(btn)) continue;
            const combined = textOf(btn) + ' ' + attrsOf(btn);
            if (hasAny(combined, DISMISS_KWS)) {
                const res = tryClick(btn, 'dialog-container');
                if (res) return res;
            }
        }
    }

    // PRIORITY 2 — any visible button with dismiss keyword that also has cookie context
    // or lives inside a fixed/sticky positioned ancestor (overlay pattern)
    const allBtns = document.querySelectorAll(
        'button,[role="button"],input[type="button"],input[type="submit"]'
    );
    for (const btn of allBtns) {
        if (!isVisible(btn)) continue;
        const txt    = textOf(btn);
        const attrs  = attrsOf(btn);
        const combined = txt + ' ' + attrs;
        if (!hasAny(combined, DISMISS_KWS)) continue;

        const parent = btn.closest(
            '[class*="cookie"],[class*="consent"],[class*="banner"],' +
            '[class*="gdpr"],[id*="cookie"],[id*="consent"]'
        );
        if (hasAny(combined, CONTEXT_KWS) || parent !== null) {
            const res = tryClick(btn, 'global-scan');
            if (res) return res;
        }
    }

    // PRIORITY 3 — role="button" / onclick divs matching dismiss + context
    const clickables = document.querySelectorAll('[role="button"],[onclick]');
    for (const el of clickables) {
        if (!isVisible(el)) continue;
        const combined = textOf(el) + ' ' + attrsOf(el);
        if (hasAny(combined, DISMISS_KWS) && hasAny(combined, CONTEXT_KWS)) {
            const res = tryClick(el, 'clickable-role');
            if (res) return res;
        }
    }

    return { clicked: false };
}
"""

# Stable attributes useful for CSS selector generation
_KEEP_ATTRS_RE = re.compile(
    r'(?:id|class|role|href|name|type|data-[a-z][a-z0-9-]*|aria-[a-z][a-z0-9-]*)="[^"]*"',
    re.IGNORECASE,
)


def _clean_html_for_plan(html: str) -> str:
    """Preserve HTML structure (tags + stable attrs) for LLM selector planning."""
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
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    html = re.sub(r"\s+", " ", html).strip()
    return html[:_MAX_TEXT_CHARS]


def _record_key(rec: dict) -> str:
    title = str(rec.get("title") or rec.get("name") or rec.get("property_name") or "")
    price = str(rec.get("price") or rec.get("price_per_night") or "")
    url = str(rec.get("source_url") or "")
    return f"{title}|{price}|{url}"


class CrawlEngine:
    """LLM-guided Playwright crawler.

    Strategy:
      1. Load the start URL.
      2. Dismiss any cookie/consent banner (known selectors → JS scan → LLM).
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
        max_items_per_page: int = 150,
    ) -> list[dict[str, Any]]:
        """Run the crawl. Returns list of extracted records."""
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
                await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)
                await page.evaluate("() => window.scrollTo(0, 0)")
                await asyncio.sleep(1)

                dismissed, cookie_status = await self._dismiss_cookie_banner(
                    page, cookie_hints=cookie_hints
                )
                if on_progress:
                    await on_progress(f"Cookie banner: {cookie_status}")
                if not dismissed and on_progress:
                    await on_progress(
                        "WARNING: Could not dismiss cookie banner automatically."
                    )

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

                    page_records = await self._extract_with_playwright(
                        page, plan, url, max_items=max_items_per_page
                    )
                    if on_progress:
                        await on_progress(
                            f"DOM extraction: {len(page_records)} records"
                            + (" — falling back to LLM" if not page_records else "")
                        )

                    if not page_records:
                        page_records = await self._extract_records(
                            html, url, collection_prompt, plan
                        )

                    if not page_records and page_num == 0:
                        if on_progress:
                            await on_progress("No records found — requesting healed plan")
                        plan = await self._heal(html, url, collection_prompt, plan)
                        if selector_hints:
                            plan["fields"] = {**(plan.get("fields") or {}), **selector_hints}
                        page_records = await self._extract_with_playwright(
                            page, plan, url, max_items=max_items_per_page
                        )
                        if not page_records:
                            page_records = await self._extract_records(
                                html, url, collection_prompt, plan
                            )

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
        """Three-tier cookie/modal dismissal.

        1. Iterate known CSS selectors (zero LLM cost, covers most major sites).
        2. JS brute-force scan inside dialogs/containers and over all buttons.
        3. User hint (text or CSS selector passed by the caller).
        4. LLM fallback (one API call, last resort).
        """
        # ── Tier 1: known CSS selectors ───────────────────────────────────────
        for sel in _COOKIE_SELECTORS:
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(1)
                    return True, f"dismissed via selector: {sel[:60]}"
            except Exception:
                continue

        # ── Tier 2: JS brute-force scan ───────────────────────────────────────
        try:
            result = await page.evaluate(_COOKIE_DISMISS_JS)
            if result.get("clicked"):
                await asyncio.sleep(1.5)
                src  = result.get("source", "js")
                text = result.get("text", "")[:50]
                return True, f"dismissed via JS scan ({src}): '{text}'"
        except Exception as exc:
            log.debug("cookie_banner.js_scan_failed", error=str(exc))

        # ── Tier 3: caller-supplied hint ──────────────────────────────────────
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
                    return True, f"dismissed via user hint: {hint_sel[:60]}"
            except Exception:
                pass

        # ── Tier 4: LLM (last resort) ─────────────────────────────────────────
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
                    return True, f"dismissed via LLM: {sel or btn_text}"
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
  "item_selector": "CSS selector matching EACH individual listing/card/item",
  "fields": {{
    "<snake_case_field>": "<CSS selector relative to the item container>",
    ...one entry per requested field...
  }},
  "next_page_selector": "CSS selector for the Next Page button/link, or null",
  "pagination_hint": "scroll|click|unknown",
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
        self, page: Any, plan: dict[str, Any], url: str, max_items: int = 150
    ) -> list[dict[str, Any]]:
        """DOM-direct extraction.

        For each field, tries the primary selector and common fallback patterns.
        Extracts text, aria-label, href, src, and data-* attributes so no
        information is silently dropped for any element type.
        """
        item_sel = plan.get("item_selector", "")
        fields: dict[str, str] = plan.get("fields") or {}
        if not item_sel or not fields:
            return []

        fallbacks: dict[str, list[str]] = {
            "title": ["[data-testid='title']", "h2", "h3", ".title"],
            "price": [
                "[data-testid='price-and-discounted-price']",
                "[data-testid*='price']", ".price",
                "[class*='price']", "[aria-label*='price' i]",
            ],
            "rating": [
                "[data-testid='review-score']",
                "[aria-label*='rating' i]", "[aria-label*='score' i]",
                ".rating", "[class*='rating']", "[class*='review-score']",
            ],
            "location": [
                "[data-testid='address']", "address",
                "[aria-label*='location' i]", "[aria-label*='address' i]",
                "[class*='location']", "[class*='address']",
            ],
            "description": ["p", "[data-testid='description']", ".description"],
            "image": ["img[src]", "img[data-src]", "[style*='background']"],
            "url": ["a[href]"],
            "link": ["a[href]"],
        }

        full_selectors: dict[str, list[str]] = {}
        for field, sel in fields.items():
            opts = [sel] if sel else []
            for fb_key, fb_sels in fallbacks.items():
                if fb_key in field.lower():
                    opts = opts + [s for s in fb_sels if s != sel]
                    break
            full_selectors[field] = opts

        js = """
        ({ item_selector, selectors, source_url, max_items }) => {
            const items = Array.from(document.querySelectorAll(item_selector))
                              .slice(0, max_items);

            function extractValue(el, fieldName) {
                if (!el) return null;
                const tag = el.tagName.toUpperCase();

                // Images — prefer alt text, then src
                if (tag === 'IMG') {
                    return el.getAttribute('alt') || el.getAttribute('src') ||
                           el.getAttribute('data-src') || null;
                }

                // Anchors — grab text AND href
                if (tag === 'A') {
                    const text = (el.innerText || el.textContent || '').trim();
                    const href = el.getAttribute('href') || '';
                    if (text) return text;
                    if (href && !href.startsWith('javascript')) return href;
                    return null;
                }

                // Input / button with value attribute
                if (['INPUT','BUTTON'].includes(tag)) {
                    const val = el.getAttribute('value') || (el.innerText || '').trim();
                    if (val) return val;
                }

                // innerText gives rendered text including child elements
                let text = (el.innerText || el.textContent || '').trim();
                if (text) return text;

                // Fallback: aria-label, title, content
                text = el.getAttribute('aria-label') ||
                       el.getAttribute('title') ||
                       el.getAttribute('content') || null;
                if (text) return text.trim();

                // Last resort: any data-* attribute that looks like a value
                for (const attr of el.attributes) {
                    if (attr.name.startsWith('data-') &&
                        attr.value && attr.value.length < 300) {
                        return attr.value;
                    }
                }
                return null;
            }

            return items.map(item => {
                const rec = { source_url };

                for (const [field, sels] of Object.entries(selectors)) {
                    let val = null;
                    for (const sel of sels) {
                        try {
                            const el = item.querySelector(sel);
                            val = extractValue(el, field);
                            if (val) break;
                        } catch(e) { continue; }
                    }
                    rec[field] = val || null;

                    // For url/link fields: ensure we also capture the href
                    const fl = field.toLowerCase();
                    if (fl.includes('url') || fl.includes('link') || fl.includes('href')) {
                        const a = item.querySelector('a[href]');
                        if (a) {
                            const href = a.getAttribute('href');
                            if (href && !href.startsWith('javascript') && !rec[field + '_href']) {
                                rec[field] = rec[field] || href;
                            }
                        }
                    }

                    // For image fields: ensure we also capture src
                    if (fl.includes('image') || fl.includes('img') ||
                        fl.includes('photo') || fl.includes('thumb')) {
                        const img = item.querySelector('img[src],img[data-src]');
                        if (img && !rec[field]) {
                            rec[field] = img.getAttribute('src') ||
                                         img.getAttribute('data-src') || null;
                        }
                    }
                }

                // Always grab the canonical item URL if available
                const firstAnchor = item.querySelector('a[href]');
                if (firstAnchor) {
                    const href = firstAnchor.getAttribute('href');
                    if (href && !href.startsWith('javascript') && !rec.item_url) {
                        rec.item_url = href.startsWith('http')
                            ? href
                            : (new URL(href, source_url)).href;
                    }
                }

                return rec;
            }).filter(r =>
                Object.entries(r).some(([k, v]) =>
                    k !== 'source_url' && k !== 'item_url' && v !== null && v !== ''
                )
            );
        }
        """
        try:
            results = await page.evaluate(js, {
                "item_selector": item_sel,
                "selectors": full_selectors,
                "source_url": url,
                "max_items": max_items,
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
        selector = plan.get("next_page_selector")

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
