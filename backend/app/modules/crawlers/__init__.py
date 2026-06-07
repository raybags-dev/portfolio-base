"""Self-healing crawler module.

A crawler that, when a site's HTML changes and its selectors stop matching,
uses an agent (heuristic + optional LLM) to discover new selectors, validate
the output, update its own config, and keep going — no manual intervention.

Built dependency-light: a stdlib DOM + static fetcher make it fully testable
offline. Swap in Playwright/httpx + BeautifulSoup for production via the
Fetcher/Extractor abstractions.
"""
