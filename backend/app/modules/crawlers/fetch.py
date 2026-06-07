"""Page fetchers behind a common interface.

`StaticFetcher` serves pre-supplied HTML (tests / fixtures / replay).
`HttpxFetcher` does real HTTP (httpx is a core dependency). Production can add
a `PlaywrightFetcher` for JS-rendered pages without touching callers.
"""

from __future__ import annotations

from typing import Protocol


class Fetcher(Protocol):
    async def fetch(self, url: str) -> str: ...


class StaticFetcher:
    """Returns HTML from an in-memory map of url -> html."""

    def __init__(self, pages: dict[str, str]) -> None:
        self._pages = pages

    async def fetch(self, url: str) -> str:
        if url not in self._pages:
            raise KeyError(f"no static page for {url}")
        return self._pages[url]


class HttpxFetcher:
    def __init__(self, timeout: float = 20.0, headers: dict[str, str] | None = None) -> None:
        self._timeout = timeout
        self._headers = headers or {
            "User-Agent": "RaybagsCrawler/0.1 (+https://raybags.com)"
        }

    async def fetch(self, url: str) -> str:
        import httpx  # core dependency, imported lazily to keep this module light

        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers,
                                     follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text
