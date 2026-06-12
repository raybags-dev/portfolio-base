"""Industry-grade multi-strategy Playwright web crawler for UDE.

Extraction pipeline per page (strategies run in parallel, best wins):

  1. SPA embedded JSON  — window.__NEXT_DATA__, __NUXT__, __APP_STATE__ etc.
                          Covers CNN (Next.js), Reddit, GitHub, most modern SPAs.
  2. Semantic containers — article, [data-asin], [data-testid*=card/result],
                          li:has(img):has(a), .card, .result …
                          Covers Amazon, eBay, job boards, property sites.
  3. Link-anchor groups  — every meaningful <a> tag becomes one record with
                          title + url + image + description + date + author.
                          Covers all news/blog sites where headlines are links.

Scoring: records × avg_meaningful_fields → pick the highest-scoring strategy.
If all three yield < 3 records, fall back to LLM-guided DOM extraction.

Cookie/modal dismissal:
  tier-1  — 80+ known CSS selectors (vendors, keywords in id/class, text matchers)
  tier-2  — JS brute-force scan inside dialogs and cookie-named containers
  tier-3  — user-supplied hint
  tier-4  — LLM (last resort, one API call)

Scroll: 6-pass scroll with incremental waits triggers lazy-loaded content.

Pagination: next-button click → URL-pattern increment → infinite scroll.

S3: raw HTML is uploaded immediately after each page loads.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from typing import Any

from app.core.logging import get_logger
from app.modules.agents.llm import LLMProvider
from app.modules.hotel_reviews.playwright_engine import (
    _COOKIE_DISMISS_JS,
    _COOKIE_SELECTORS,
    _clean_html_for_text,
)

log = get_logger("ude.crawler")

_STEALTH_SCRIPT = """
() => {
    Object.defineProperty(navigator, 'webdriver',  {get: () => undefined});
    Object.defineProperty(navigator, 'plugins',    {get: () => [1, 2, 3, 4, 5]});
    Object.defineProperty(navigator, 'languages',  {get: () => ['en-US', 'en']});
    Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (p) =>
        p.name === 'notifications'
            ? Promise.resolve({state: Notification.permission})
            : origQuery(p);
}
"""

# ── Comprehensive multi-strategy extraction JS ────────────────────────────────
# Returns { spa, containers, links, spa_key, container_sel }
# Python side picks the strategy with the best score.
_EXTRACT_JS = """
({max_items, source_url}) => {
    const out = { spa: [], containers: [], links: [], spa_key: null, container_sel: null };

    /* ── helpers ──────────────────────────────────────────────────── */
    function clean(s) { return (s || '').replace(/\\s+/g, ' ').trim(); }

    function isVisible(el) {
        try {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0
                && s.visibility !== 'hidden' && s.display !== 'none';
        } catch(e) { return true; }
    }

    function isChrome(el) {
        return !!el.closest(
            'nav,header,footer,[role="navigation"],[role="banner"],' +
            '[class*="nav-"],[class*="-nav"],[class*="sidebar"],' +
            '[class*="footer"],[class*="breadcrumb"],[class*="pagination"]'
        );
    }

    function sanitiseKey(s) {
        return s.toLowerCase().replace(/[^a-z0-9]/g, '_')
                .replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'f';
    }

    function uniqueKey(rec, base) {
        let k = base, n = 2;
        while (k in rec) k = base + '_' + (n++);
        return k;
    }

    /* ── Strategy 1: SPA embedded JSON state ─────────────────────── */
    function scoreArr(arr) {
        if (!arr || arr.length < 2) return 0;
        const sample = arr.slice(0, 8).filter(x => x && typeof x === 'object' && !Array.isArray(x));
        if (!sample.length) return 0;
        const avgK = sample.reduce((s, o) => s + Object.keys(o).length, 0) / sample.length;
        return arr.length * Math.min(avgK, 30);
    }

    function walkForArrays(obj, depth, found) {
        if (depth > 12 || obj === null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            if (obj.length >= 2 && obj.some(x => x && typeof x === 'object' && !Array.isArray(x)))
                found.push(obj);
            for (const v of obj) walkForArrays(v, depth + 1, found);
            return;
        }
        for (const v of Object.values(obj)) walkForArrays(v, depth + 1, found);
    }

    const SPA_KEYS = [
        '__NEXT_DATA__','__NUXT__','__APP_STATE__','__INITIAL_STATE__',
        '__PRELOADED_STATE__','__REDUX_STATE__','__DATA__','__STORE__',
        '__APOLLO_STATE__','__remixContext','initialData','__PAGE_PROPS__',
    ];

    let bestSpaScore = 0;
    for (const key of SPA_KEYS) {
        try {
            const val = window[key];
            if (!val) continue;
            const found = [];
            walkForArrays(val, 0, found);
            if (!found.length) continue;
            found.sort((a, b) => scoreArr(b) - scoreArr(a));
            const score = scoreArr(found[0]);
            if (score > bestSpaScore) {
                bestSpaScore = score;
                out.spa = found[0].slice(0, max_items).map(item =>
                    (item && typeof item === 'object') ? Object.assign({}, item) : {value: String(item)}
                );
                out.spa_key = key;
            }
        } catch(e) {}
    }

    /* ── Strategy 2: Semantic container extraction ─────────────────── */
    const CONTAINER_SELS = [
        /* data attributes — most stable */
        '[data-component-type*="result"]',
        '[data-component-type*="card"]',
        '[data-testid*="result-item"]',
        '[data-testid*="article"]',
        '[data-testid*="story"]',
        '[data-testid*="card"]',
        '[data-testid*="listing"]',
        '[data-testid*="product"]',
        '[data-asin]',
        '[data-item-id]',
        '[data-id]:has(a):has(img)',
        /* semantic */
        'article',
        /* common class patterns */
        '[class*="article-card"]',
        '[class*="story-card"]',
        '[class*="news-card"]',
        '[class*="news-item"]',
        '[class*="product-card"]',
        '[class*="result-item"]',
        '[class*="search-result"]',
        '[class*="card-item"]',
        '[class*="item-card"]',
        '[class*="listing-item"]',
        '[class*="feed-item"]',
        '[class*="post-card"]',
        /* composed */
        'li:has(h2):has(a)',
        'li:has(h3):has(a)',
        'li:has(a[href]):has(img)',
        '[role="listitem"]:has(a)',
        /* broad fallbacks */
        '.card',
        '.item',
        '.result',
    ];

    function extractContainer(el) {
        const rec = {};

        /* canonical URL */
        for (const a of el.querySelectorAll('a[href]')) {
            const h = a.href || a.getAttribute('href') || '';
            if (h && !h.startsWith('javascript') && !h.endsWith('#')) {
                rec._url = h;
                break;
            }
        }

        /* images — lazy-load aware */
        for (const img of el.querySelectorAll('img,[style*="background"]')) {
            const src = img.src
                || img.getAttribute('data-src')
                || img.getAttribute('data-lazy-src')
                || img.getAttribute('data-original')
                || (img.getAttribute('srcset') || '').split(' ')[0]
                || (img.style && img.style.backgroundImage.replace(/url\\(['"]?([^'"]+)['"]?\\)/, '$1'));
            if (src && !src.startsWith('data:') && src.length > 10) {
                rec._image = src;
                rec._image_alt = img.alt || null;
                break;
            }
        }

        /* all text-bearing descendants */
        const TEXT_SELS = 'h1,h2,h3,h4,h5,h6,p,span,time,em,strong,' +
            '[class*="title"],[class*="heading"],[class*="name"],' +
            '[class*="desc"],[class*="price"],[class*="date"],' +
            '[class*="author"],[class*="category"],[class*="tag"],' +
            '[class*="label"],[class*="rating"],[class*="review"],' +
            '[class*="time"],[class*="location"],[class*="brand"],' +
            '[class*="summary"],[class*="excerpt"],[class*="teaser"],' +
            '[class*="condition"],[class*="stock"],[class*="badge"],' +
            '[class*="score"],[class*="count"]';

        const seen = new Set();
        for (const te of el.querySelectorAll(TEXT_SELS)) {
            const text = clean(te.innerText || te.textContent || '');
            if (!text || text.length < 2 || text.length > 2000 || seen.has(text)) continue;
            seen.add(text);
            const tag = te.tagName.toLowerCase();
            const cls = (te.className || '').toString().split(/\\s+/)
                          .find(c => c.length > 2 && c.length < 45 && !/^[0-9]/.test(c)) || '';
            const base = sanitiseKey(te.id || cls || tag);
            rec[uniqueKey(rec, base)] = text;
        }

        return rec;
    }

    /* pick selector with most visible, non-chrome items */
    let bestSel = null, bestCount = 0;
    for (const sel of CONTAINER_SELS) {
        try {
            const els = Array.from(document.querySelectorAll(sel))
                            .filter(el => isVisible(el) && !isChrome(el));
            if (els.length >= 2 && els.length > bestCount && els.length <= max_items * 4) {
                bestCount = els.length;
                bestSel = sel;
            }
        } catch(e) {}
    }

    if (bestSel) {
        out.container_sel = bestSel;
        out.containers = Array.from(document.querySelectorAll(bestSel))
            .filter(el => isVisible(el) && !isChrome(el))
            .slice(0, max_items)
            .map(extractContainer)
            .filter(r => Object.keys(r).length > 1);
    }

    /* ── Strategy 3: Link-anchor grouping ─────────────────────────── */
    const seenUrls = new Set();

    for (const a of document.querySelectorAll('a[href]')) {
        if (isChrome(a) || !isVisible(a)) continue;
        const title = clean(a.innerText || a.textContent || '');
        if (title.length < 10 || title.length > 600) continue;
        const href = a.href;
        if (!href || href.startsWith('javascript') || href.endsWith('#') || seenUrls.has(href)) continue;
        seenUrls.add(href);

        const rec = { title, url: href };

        /* nearest image */
        const container = a.closest(
            'article,li,[class*="card"],[class*="item"],[class*="story"],' +
            '[class*="result"],[class*="teaser"],[class*="post"],[class*="entry"]'
        );
        const imgEl = a.querySelector('img')
            || container?.querySelector('img')
            || a.parentElement?.querySelector('img');
        if (imgEl) {
            rec.image = imgEl.src || imgEl.getAttribute('data-src') || null;
            if (rec.image && rec.image.startsWith('data:')) delete rec.image;
            rec.image_alt = imgEl.alt || null;
        }

        if (container) {
            const pick = (sel) => {
                const el = container.querySelector(sel);
                return el ? clean(el.innerText || el.textContent || '') : null;
            };
            rec.description = pick('[class*="desc"],[class*="summary"],[class*="excerpt"],[class*="teaser"],p');
            const dateEl = container.querySelector('time,[datetime],[class*="date"],[class*="time"],[class*="timestamp"]');
            if (dateEl) rec.published_date = dateEl.getAttribute('datetime') || clean(dateEl.innerText || '');
            rec.author   = pick('[class*="author"],[class*="byline"],[rel="author"]');
            rec.category = pick('[class*="category"],[class*="section"],[class*="topic"],[class*="tag"],[class*="label"],[class*="kicker"]');
        }

        /* remove nulls */
        for (const k of Object.keys(rec)) if (rec[k] === null || rec[k] === '') delete rec[k];

        out.links.push(rec);
        if (out.links.length >= max_items) break;
    }

    return out;
}
"""

# JS for paginating via next-button click
_NEXT_PAGE_JS = """
() => {
    const NEXT_SELS = [
        '[aria-label="Next page"]',
        '[aria-label="Next"]',
        'button[data-testid="pagination-next"]',
        '[data-testid*="next"]',
        'a[rel="next"]',
        '.pagination-next a',
        '.next-page a',
        'a.next',
        'button.next',
        '[class*="pagination"] [class*="next"]',
        '[class*="pager"] [class*="next"]',
        'a:has-text("Next")',
        'button:has-text("Next")',
        'a:has-text("›")',
        'a:has-text("»")',
    ];
    for (const sel of NEXT_SELS) {
        try {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) { el.click(); return true; }
        } catch(e) {}
    }
    return false;
}
"""


def _score(records: list[dict]) -> float:
    """Score a strategy: record_count × avg meaningful non-private fields."""
    if not records:
        return 0.0
    total = sum(
        len([v for k, v in r.items() if not k.startswith("_") and v and str(v).strip()])
        for r in records
    )
    return len(records) * (total / max(len(records), 1))


def _pick_best(
    spa: list[dict],
    containers: list[dict],
    links: list[dict],
    spa_key: str | None,
    container_sel: str | None,
) -> tuple[str, list[dict]]:
    """Return (strategy_label, records) for the highest-scoring strategy."""
    options = [
        (f"spa:{spa_key or 'state'}", spa),
        (f"container:{container_sel or 'dom'}", containers),
        ("links", links),
    ]
    options.sort(key=lambda x: _score(x[1]), reverse=True)
    label, recs = options[0]
    return label, recs if recs else []


async def _save_html_to_s3(session_id: int, url: str, html: str) -> None:
    try:
        from app.core.storage_s3 import is_configured, upload_blob
        if not is_configured():
            return
        url_hash = hashlib.sha1(url.encode()).hexdigest()[:12]
        key = f"ude/sessions/{session_id}/html/{url_hash}.html"
        await upload_blob(key, html, content_type="text/html; charset=utf-8")
    except Exception as exc:
        log.debug("ude.crawler.s3_html_skip", error=str(exc))


class UDECrawler:
    """Industry-grade multi-strategy Playwright crawler for UDE sessions."""

    def __init__(self, provider: LLMProvider | None, *, max_pages: int = 5) -> None:
        self.provider = provider
        self.max_pages = max_pages

    # ── Public API ────────────────────────────────────────────────────────────

    async def crawl(
        self,
        url: str,
        prompt: str,
        *,
        session_id: int = 0,
        max_records: int = 500,
        extra_headers: dict | None = None,
        on_progress: Any = None,
    ) -> tuple[str, list[dict]]:
        """Crawl *url* and return (strategy_used, flat_records).

        Retries once on ENOSPC (WSL2 /tmp quirk) after sweeping stale
        playwright artifact dirs and redirecting TMPDIR to ~/.pw-tmp.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            if on_progress:
                await on_progress(
                    "ERROR: Playwright not installed — "
                    "`pip install playwright && playwright install chromium`"
                )
            return "error", []

        from app.core.health import _cleanup_pw_dirs, prepare_playwright

        all_records: list[dict] = []
        seen_keys: set[str] = set()
        strategy_used = "none"

        for attempt in range(2):
            # On retry: do an aggressive tmp sweep first then wait briefly.
            if attempt > 0:
                _cleanup_pw_dirs()
                await asyncio.sleep(1)

            # Must be called right before async_playwright() so the Node.js
            # child process inherits TMPDIR = ~/.pw-tmp.
            prepare_playwright()

            try:
                async with async_playwright() as p:
                    browser = await self._launch_browser(p)
                    context = await browser.new_context(
                        user_agent=(
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/124.0.0.0 Safari/537.36"
                        ),
                        viewport={"width": 1920, "height": 1080},
                        locale="en-US",
                        timezone_id="America/New_York",
                        extra_http_headers={
                            "Accept-Language": "en-US,en;q=0.9",
                            **(extra_headers or {}),
                        },
                    )
                    await context.add_init_script(_STEALTH_SCRIPT)
                    page = await context.new_page()

                    try:
                        current_url = url
                        for page_num in range(self.max_pages):
                            if on_progress:
                                await on_progress(
                                    f"{'Loading' if page_num == 0 else 'Page ' + str(page_num + 1) + ':'} "
                                    f"{current_url}"
                                )

                            loaded = await self._load_page(page, current_url, on_progress)
                            if not loaded:
                                break

                            if page_num == 0:
                                dismissed, status = await self._dismiss_cookie_banner(page)
                                if on_progress:
                                    await on_progress(f"Cookie/modal: {status}")
                                if dismissed:
                                    await asyncio.sleep(1)

                            await self._scroll_page(page, passes=6, on_progress=on_progress)

                            html = await page.content()
                            asyncio.ensure_future(
                                _save_html_to_s3(session_id, page.url, html)
                            )

                            page_records, strategy_used = await self._extract_page(
                                page, page.url, max_records, prompt, html
                            )

                            if on_progress:
                                await on_progress(
                                    f"Page {page_num + 1}: strategy={strategy_used}, "
                                    f"{len(page_records)} records"
                                )

                            for rec in page_records:
                                key = self._dedup_key(rec)
                                if key in seen_keys:
                                    continue
                                seen_keys.add(key)
                                all_records.append(rec)
                                if len(all_records) >= max_records:
                                    break

                            if len(all_records) >= max_records:
                                break

                            if page_num < self.max_pages - 1:
                                navigated = await self._go_next(page, page.url, page_num)
                                if not navigated:
                                    if on_progress:
                                        await on_progress("No further pages — crawl complete.")
                                    break
                                current_url = page.url
                                await asyncio.sleep(2.5)
                    finally:
                        await context.close()
                        await browser.close()

                # Success — break out of retry loop
                break

            except Exception as exc:
                if "ENOSPC" in str(exc) and attempt == 0:
                    if on_progress:
                        await on_progress(
                            "WARNING: ENOSPC on /tmp — cleaning up and retrying…"
                        )
                    continue  # retry
                raise  # re-raise on second attempt or non-ENOSPC error

        if on_progress:
            await on_progress(
                f"Crawl done: {len(all_records)} unique records via {strategy_used}."
            )

        from app.modules.universal_extractor.extractor import _flatten_record
        return strategy_used, [_flatten_record(r) for r in all_records]

    # ── Browser setup ─────────────────────────────────────────────────────────

    async def _launch_browser(self, playwright: Any) -> Any:
        return await playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
                "--disable-extensions",
                "--no-first-run",
                "--disable-default-apps",
                "--disable-infobars",
                "--window-size=1920,1080",
                "--ignore-certificate-errors",
                "--disable-web-security",
                "--allow-running-insecure-content",
            ],
        )

    # ── Page loading ──────────────────────────────────────────────────────────

    async def _load_page(self, page: Any, url: str, on_progress: Any) -> bool:
        """Load URL with adaptive wait strategy. Returns True on success."""
        if on_progress:
            await on_progress(f"Fetching: {url[:80]}…")
        try:
            await page.goto(url, wait_until="networkidle", timeout=30_000)
            if on_progress:
                await on_progress("Page loaded (networkidle)")
            return True
        except Exception:
            pass
        # networkidle hangs on sites with persistent SSE/WS — fall back
        if on_progress:
            await on_progress("Retrying with domcontentloaded…")
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            await asyncio.sleep(3)
            if on_progress:
                await on_progress("Page loaded (domcontentloaded)")
            return True
        except Exception as exc:
            if on_progress:
                await on_progress(f"WARNING: page load failed — {exc}")
            return False

    # ── Multi-pass scrolling ──────────────────────────────────────────────────

    async def _scroll_page(self, page: Any, passes: int = 6, on_progress: Any = None) -> None:
        """Scroll the page multiple times to trigger lazy-loaded content."""
        if on_progress:
            await on_progress(f"Scrolling ({passes} passes to load lazy content)…")
        for i in range(passes):
            try:
                await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1.0)
                if i == passes // 2:
                    await page.evaluate("() => window.scrollTo(0, 0)")
                    await asyncio.sleep(0.6)
                    if on_progress:
                        await on_progress(f"Scroll pass {i + 1}/{passes} — mid-page reveal…")
            except Exception:
                break
        try:
            await page.evaluate("() => window.scrollTo(0, 0)")
        except Exception:
            pass

    # ── Cookie/modal dismissal ────────────────────────────────────────────────

    async def _dismiss_cookie_banner(self, page: Any) -> tuple[bool, str]:
        """4-tier dismissal: CSS selectors → JS scan → LLM."""
        # Tier 1 — known CSS selectors
        for sel in _COOKIE_SELECTORS:
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(1.2)
                    return True, f"dismissed via selector: {sel[:50]}"
            except Exception:
                continue

        # Tier 2 — JS brute-force scan
        try:
            result = await page.evaluate(_COOKIE_DISMISS_JS)
            if result.get("clicked"):
                await asyncio.sleep(1.5)
                return True, f"dismissed via JS scan ({result.get('source')}): '{result.get('text','')[:40]}'"
        except Exception as exc:
            log.debug("cookie.js_scan_failed", error=str(exc))

        # Tier 3 — LLM (if provider available and page looks like it has a banner)
        if self.provider:
            html_text = _clean_html_for_text(await page.content())
            if any(kw in html_text.lower() for kw in ["cookie", "consent", "gdpr", "privacy"]):
                try:
                    result = await self.provider.propose_json(
                        "Dismiss a cookie consent banner. Return JSON only.",
                        f"Page text:\n{html_text[:2500]}\n\n"
                        'Return {"selector":"<css_or_null>","button_text":"<text_or_null>","found":true|false}',
                        fallback={"found": False},
                    )
                    if result.get("found"):
                        sel = result.get("selector")
                        btn = result.get("button_text")
                        el = None
                        if sel:
                            el = await page.query_selector(sel)
                        if not el and btn:
                            el = await page.query_selector(f"button:has-text('{btn}')")
                        if el and await el.is_visible():
                            await el.click()
                            await asyncio.sleep(1)
                            return True, f"dismissed via LLM: {sel or btn}"
                except Exception:
                    pass

        return False, "no banner found or could not dismiss"

    # ── Page extraction ───────────────────────────────────────────────────────

    async def _extract_page(
        self,
        page: Any,
        url: str,
        max_items: int,
        prompt: str,
        html: str,
    ) -> tuple[list[dict], str]:
        """Run all three extraction strategies and return the best result."""
        # Run the comprehensive JS extractor
        try:
            result = await page.evaluate(_EXTRACT_JS, {"max_items": max_items, "source_url": url})
        except Exception as exc:
            log.warning("ude.crawler.extract_js_failed", error=str(exc))
            result = {"spa": [], "containers": [], "links": [], "spa_key": None, "container_sel": None}

        spa        = result.get("spa", [])
        containers = result.get("containers", [])
        links      = result.get("links", [])
        spa_key    = result.get("spa_key")
        cont_sel   = result.get("container_sel")

        strategy, records = _pick_best(spa, containers, links, spa_key, cont_sel)

        # If all three strategies are thin, try LLM-guided DOM extraction
        if len(records) < 3 and self.provider:
            if (fallback_recs := await self._llm_extract(html, url, prompt)):
                strategy = "llm"
                records  = fallback_recs

        # Absolute last resort: pull every visible text node as a record
        if len(records) < 2:
            strategy = "text_dump"
            records  = await self._text_dump(page, url, max_items)

        return records, strategy

    async def _llm_extract(
        self, html: str, url: str, prompt: str
    ) -> list[dict]:
        """LLM-guided extraction as fallback when JS strategies find nothing."""
        if not self.provider:
            return []
        system = (
            "You are a data extraction expert. Extract structured records from page text. "
            "Return JSON only."
        )
        cleaned = _clean_html_for_text(html)
        try:
            result = await self.provider.propose_json(
                system,
                f"URL: {url}\nGoal: {prompt}\n\nPage text:\n{cleaned[:6000]}\n\n"
                'Extract every item. Return {"records": [...]}',
                fallback={"records": []},
            )
            recs = result.get("records", [])
            if isinstance(recs, list):
                return [r for r in recs if isinstance(r, dict)]
        except Exception as exc:
            log.debug("ude.crawler.llm_extract_failed", error=str(exc))
        return []

    async def _text_dump(self, page: Any, url: str, max_items: int) -> list[dict]:
        """Pull all visible text into individual records. Never returns empty."""
        js = """
        ({max_items, source_url}) => {
            const recs = [];
            const seen = new Set();
            const HEADING_SELS = 'h1,h2,h3,h4,p,li,td,th,span[class],div[class]';
            for (const el of document.querySelectorAll(HEADING_SELS)) {
                const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
                if (text.length < 10 || text.length > 2000 || seen.has(text)) continue;
                seen.add(text);
                const a = el.querySelector('a') || (el.tagName === 'A' ? el : null);
                recs.push({ text, url: a ? a.href : source_url });
                if (recs.length >= max_items) break;
            }
            return recs;
        }
        """
        try:
            result = await page.evaluate(js, {"max_items": max_items, "source_url": url})
            if isinstance(result, list):
                return result
        except Exception:
            pass
        return [{"text": "extraction failed", "url": url}]

    # ── Pagination ────────────────────────────────────────────────────────────

    async def _go_next(self, page: Any, current_url: str, page_num: int) -> bool:
        """Try to navigate to the next page. Returns True if navigated."""
        # 1. Next-button JS click
        try:
            clicked = await page.evaluate(_NEXT_PAGE_JS)
            if clicked:
                await page.wait_for_load_state("domcontentloaded", timeout=15_000)
                await asyncio.sleep(2)
                if page.url != current_url:
                    return True
        except Exception:
            pass

        # 2. URL pattern increment (?page=N or /page/N)
        next_url = self._increment_page_url(current_url, page_num + 2)
        if next_url and next_url != current_url:
            try:
                await page.goto(next_url, wait_until="domcontentloaded", timeout=20_000)
                await asyncio.sleep(2)
                return True
            except Exception:
                pass

        # 3. Infinite scroll — scroll and check if DOM grew
        try:
            prev = await page.evaluate("() => document.querySelectorAll('article,li,[data-id],[data-asin]').length")
            await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(3)
            now = await page.evaluate("() => document.querySelectorAll('article,li,[data-id],[data-asin]').length")
            if now > prev + 2:
                log.debug("ude.crawler.scroll_loaded", prev=prev, now=now)
                return True
        except Exception:
            pass

        return False

    @staticmethod
    def _increment_page_url(url: str, next_page: int) -> str | None:
        """Try to detect and increment a page number in the URL."""
        # ?page=N
        m = re.search(r"([?&]page=)(\d+)", url)
        if m:
            return url[: m.start(2)] + str(next_page) + url[m.end(2):]
        # /page/N
        m = re.search(r"(/page/)(\d+)", url)
        if m:
            return url[: m.start(2)] + str(next_page) + url[m.end(2):]
        # ?p=N
        m = re.search(r"([?&]p=)(\d+)", url)
        if m:
            return url[: m.start(2)] + str(next_page) + url[m.end(2):]
        # If page 2 and no pattern found, try appending ?page=2
        if next_page == 2:
            sep = "&" if "?" in url else "?"
            return f"{url.rstrip('/')}{sep}page=2"
        return None

    @staticmethod
    def _dedup_key(rec: dict) -> str:
        title = str(rec.get("title") or rec.get("headline") or rec.get("name") or rec.get("text") or "")
        url = str(rec.get("url") or rec.get("_url") or rec.get("item_url") or "")
        return f"{title[:120]}|{url[:120]}"
