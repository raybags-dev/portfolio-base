"""Feature-flag service — the platform's runtime control layer.

Every capability (crawlers, AI, Kafka, reports, storage, analytics...) is
gated by a flag that the admin panel toggles at runtime. Modules check
``await is_enabled(db, "ENABLE_X")`` before doing work, so nothing requires a
redeploy to turn on or off.

``DEFAULT_FLAGS`` is the canonical catalogue, seeded idempotently.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import FeatureFlag

# key -> (label, group, default_enabled, description)
DEFAULT_FLAGS: dict[str, tuple[str, str, bool, str]] = {
    # core modules
    "ENABLE_CRAWLERS": ("Crawlers", "modules", False, "Web crawling / scraping subsystem"),
    "ENABLE_AI": ("AI", "modules", False, "AI tools (SQL assistant, cleaners, generators)"),
    "ENABLE_AGENTIC_AI": ("Agentic AI", "modules", False, "Autonomous agent orchestration"),
    "ENABLE_REPORT_GENERATOR": ("Report Generator", "modules", False, "PDF/Excel/CSV reports"),
    "ENABLE_PIPELINES": ("Pipelines", "modules", False, "Data engineering pipelines"),
    "ENABLE_DBT": ("DBT", "modules", False, "DBT transformations"),
    "ENABLE_SCHEDULER": ("Scheduler", "modules", False, "Scheduled jobs (APScheduler/Celery)"),
    "ENABLE_ANALYTICS": ("Analytics", "modules", True, "Analytics aggregation"),
    "ENABLE_DASHBOARD": ("Dashboards", "modules", True, "Dashboard rendering"),
    "ENABLE_CHAT": ("Chat", "modules", False, "Chatbot over datasets"),
    "ENABLE_NOTIFICATIONS": ("Notifications", "modules", True, "In-app / email notifications"),
    # infra
    "ENABLE_KAFKA": ("Kafka", "infra", False, "Kafka event streaming"),
    "ENABLE_RABBITMQ": ("RabbitMQ", "infra", False, "RabbitMQ task queue"),
    "ENABLE_STORAGE": ("Storage", "infra", True, "Object storage subsystem"),
    "ENABLE_S3": ("AWS S3", "infra", False, "AWS S3 storage provider"),
    "ENABLE_GCP": ("GCP Storage", "infra", False, "Google Cloud Storage provider"),
    "ENABLE_LOGGING": ("Logging", "infra", True, "Centralized logging"),
    "ENABLE_METRICS": ("Metrics", "infra", True, "Prometheus metrics"),
    "ENABLE_PUBLIC_API": ("Public API", "infra", True, "Public read API surface"),
    # data projects (each maps to a microservice card)
    "ENABLE_RETAIL": ("Retail Price Intelligence", "projects", False, "Retail price crawler/analytics"),
    "ENABLE_HOTEL_REVIEWS": ("Hotel Review Analytics", "projects", True, "Review sentiment analytics"),
    "ENABLE_SPORTS": ("Sports Analytics", "projects", False, "Sports data & predictions"),
    "ENABLE_WEATHER": ("Weather Pipeline", "projects", False, "Weather ETL & forecasting"),
    "ENABLE_NEWS": ("News Pipeline", "projects", False, "News ingestion & summarization"),
    "ENABLE_STOCKS": ("Stock Pipeline", "projects", False, "Stock ETL & predictions"),
    "ENABLE_CRYPTO": ("Crypto Analytics", "projects", False, "Crypto market analytics"),
    "ENABLE_AIRLINE": ("Airline Price Tracker", "projects", False, "Flight price tracking"),
    "ENABLE_JOBS": ("Job Market Analytics", "projects", False, "Job market trends"),
    "ENABLE_ENERGY": ("Energy Market Pipeline", "projects", False, "Energy market data"),
    "ENABLE_SOCIAL": ("Social Media Trends", "projects", False, "Social trend detection"),
    # tools / standalone platforms
    "ENABLE_ANNOTATION": ("Data Annotation Platform", "projects", False, "Intelligent data annotation & AI labeling pipeline"),
}


class FeatureFlagService:
    """Read/seed/toggle feature flags. Stateless; pass a session in."""

    @staticmethod
    async def is_enabled(db: AsyncSession, key: str, default: bool = False) -> bool:
        flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.key == key))
        return flag.enabled if flag else default

    @staticmethod
    async def all_enabled(db: AsyncSession) -> dict[str, bool]:
        rows = (await db.scalars(select(FeatureFlag))).all()
        return {f.key: f.enabled for f in rows}

    @staticmethod
    async def ensure_defaults(db: AsyncSession) -> int:
        """Insert any missing flags from the catalogue. Returns count added."""
        existing = set((await db.scalars(select(FeatureFlag.key))).all())
        added = 0
        for key, (label, group, enabled, desc) in DEFAULT_FLAGS.items():
            if key in existing:
                continue
            db.add(
                FeatureFlag(
                    key=key, label=label, group=group, enabled=enabled, description=desc
                )
            )
            added += 1
        if added:
            await db.commit()
        return added


flags = FeatureFlagService()
