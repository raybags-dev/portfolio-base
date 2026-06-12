"""News extraction service — crawls CNN (and future sources) on a schedule.

Each run launches UDECrawler, extracts article titles/URLs/descriptions,
and upserts results into the news_items table (deduplicated by URL).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.platform import NewsItem

log = get_logger("news.service")

CNN_URL = "https://edition.cnn.com/"
CNN_PROMPT = (
    "Extract all news article headlines, URLs, brief descriptions, "
    "category/section names, and publication dates. "
    "Focus on actual news articles, not navigation or promotional links."
)


def _is_sqlite(db: AsyncSession) -> bool:
    return "sqlite" in str(db.bind.url) if db.bind else False


async def extract_and_store(
    db: AsyncSession,
    source_url: str = CNN_URL,
    extraction_prompt: str = CNN_PROMPT,
    max_records: int = 80,
    source_name: str = "CNN",
) -> dict[str, Any]:
    """Crawl ``source_url``, extract news records, upsert into news_items.

    Returns a summary dict with counts of new/updated items.
    """
    from app.modules.universal_extractor.crawler import UDECrawler

    log.info("news.extract.start", source=source_url)
    crawler = UDECrawler(provider=None, max_pages=2)

    _, records = await crawler.crawl(
        source_url,
        extraction_prompt,
        session_id=0,
        max_records=max_records,
        extra_headers={},
        on_progress=None,
    )

    if not records:
        log.warning("news.extract.empty", source=source_url)
        return {"inserted": 0, "skipped": 0, "total_crawled": 0}

    inserted = 0
    skipped = 0

    for rec in records:
        title = (
            str(rec.get("title") or rec.get("name") or rec.get("headline") or "")
            .strip()[:500]
        )
        if not title or len(title) < 10:
            skipped += 1
            continue

        url = str(rec.get("url") or rec.get("item_url") or rec.get("link") or "").strip()[:2000]
        description = str(rec.get("description") or rec.get("summary") or rec.get("excerpt") or "").strip()[:2000] or None
        image_url = str(rec.get("image") or rec.get("image_url") or rec.get("thumbnail") or "").strip()[:2000] or None
        category = str(rec.get("category") or rec.get("section") or rec.get("topic") or "").strip()[:60] or None
        author = str(rec.get("author") or rec.get("by") or "").strip()[:120] or None
        published_at = str(rec.get("published_date") or rec.get("date") or rec.get("time") or "").strip()[:60] or None

        # Deduplicate by URL if present, otherwise by title
        if url:
            existing = await db.scalar(select(NewsItem).where(NewsItem.url == url))
        else:
            existing = await db.scalar(select(NewsItem).where(NewsItem.title == title))

        if existing:
            # Update description/image if we got better data
            if description and not existing.description:
                existing.description = description
            if image_url and not existing.image_url:
                existing.image_url = image_url
            skipped += 1
        else:
            item = NewsItem(
                title=title,
                url=url or None,
                description=description,
                image_url=image_url,
                source=source_name,
                category=category,
                author=author,
                published_at=published_at,
                is_breaking=False,
            )
            db.add(item)
            inserted += 1

    await db.commit()
    log.info("news.extract.done", inserted=inserted, skipped=skipped, total=len(records))
    return {"inserted": inserted, "skipped": skipped, "total_crawled": len(records)}


async def get_feed(
    db: AsyncSession,
    limit: int = 60,
    source: str | None = None,
) -> list[dict[str, Any]]:
    q = select(NewsItem).order_by(NewsItem.id.desc()).limit(limit)
    if source:
        q = q.where(NewsItem.source == source)
    rows = (await db.scalars(q)).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "url": r.url,
            "description": r.description,
            "image_url": r.image_url,
            "source": r.source,
            "category": r.category,
            "author": r.author,
            "published_at": r.published_at,
            "is_breaking": r.is_breaking,
            "extracted_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
