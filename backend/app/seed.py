"""Idempotent database seed.

Run with:  python -m app.seed

Creates RBAC roles/permissions, the bootstrap admin, default site content,
feature flags, and registers the data-engineering microservice catalogue so
their cards appear in the portfolio once their feature flag is enabled.

Safe to run repeatedly — existing rows are left untouched.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal, init_models
from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.models.content import (
    AboutMe,
    HeroSection,
    SiteConfiguration,
    SocialLink,
    Theme,
)
from app.models.platform import Microservice
from app.models.portfolio import Project, Skill
from app.models.user import Permission, Role, User
from app.services.feature_flags import flags

log = get_logger("app.seed")

# permission code -> description
PERMISSIONS = {
    "content:read": "Read content",
    "content:write": "Create/update content",
    "content:delete": "Delete content",
    "users:manage": "Manage users",
    "flags:manage": "Manage feature flags",
    "system:admin": "Full system administration",
}

ROLES = {
    "admin": list(PERMISSIONS.keys()),
    "editor": ["content:read", "content:write"],
    "viewer": ["content:read"],
}

# data-engineering microservice catalogue (flag -> card)
MICROSERVICES = [
    ("retail", "Retail Price Intelligence", "Crawl & analyse retail prices across Amazon, Bol, Coolblue, MediaMarkt, AH, Jumbo.", "data", "ENABLE_RETAIL"),
    ("hotel-reviews", "Hotel Review Analytics", "Sentiment & topic analytics over Booking, Google, TripAdvisor reviews.", "data", "ENABLE_HOTEL_REVIEWS"),
    ("sports", "Sports Analytics", "Football, F1, NBA, cricket, rugby — predictions & rankings.", "data", "ENABLE_SPORTS"),
    ("weather", "Weather Pipeline", "Collect, transform, store & forecast weather trends.", "data", "ENABLE_WEATHER"),
    ("news", "News Pipeline", "RSS/News APIs, topic extraction, summarization, embedding search.", "data", "ENABLE_NEWS"),
    ("stocks", "Stock Pipeline", "Yahoo/Polygon/Alpaca daily ETL & prediction models.", "data", "ENABLE_STOCKS"),
    ("crypto", "Crypto Analytics", "Prices, whales, sentiment, indicators & reports.", "data", "ENABLE_CRYPTO"),
    ("airline", "Airline Price Tracker", "Historical pricing, prediction & alerts.", "data", "ENABLE_AIRLINE"),
    ("jobs", "Job Market Analytics", "LinkedIn/Indeed/RemoteOK skill demand & salary trends.", "data", "ENABLE_JOBS"),
    ("energy", "Energy Market Pipeline", "Electricity, gas, carbon, wind & solar data.", "data", "ENABLE_ENERGY"),
    ("social", "Social Media Trends", "Twitter/Reddit/YouTube/TikTok trend detection.", "data", "ENABLE_SOCIAL"),
]

# standalone tools/platforms with a live URL (key, name, desc, category, flag, base_url)
TOOLS = [
    (
        "annotation",
        "Data Annotation Platform",
        "Full-stack ML annotation pipeline — upload CSV/JSON/Excel, validate, clean, and label records with local AI (Ollama/llama3).",
        "tools",
        "ENABLE_ANNOTATION",
        "https://raybags.com/annotation",
    ),
]


async def _seed_rbac(db) -> dict[str, Role]:
    perms: dict[str, Permission] = {}
    for code, desc in PERMISSIONS.items():
        perm = await db.scalar(select(Permission).where(Permission.code == code))
        if not perm:
            perm = Permission(code=code, description=desc)
            db.add(perm)
        perms[code] = perm
    await db.flush()

    roles: dict[str, Role] = {}
    for name, codes in ROLES.items():
        role = await db.scalar(select(Role).where(Role.name == name))
        if not role:
            role = Role(name=name, description=f"{name.title()} role")
            db.add(role)
        role.permissions = [perms[c] for c in codes]
        roles[name] = role
    await db.flush()
    return roles


async def _seed_admin(db, admin_role: Role) -> None:
    admin = await db.scalar(select(User).where(User.email == settings.FIRST_ADMIN_EMAIL))
    if admin:
        log.info("seed.admin.exists", email=admin.email)
        return
    admin = User(
        email=settings.FIRST_ADMIN_EMAIL,
        full_name=settings.FIRST_ADMIN_NAME,
        hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
        is_active=True,
        is_superuser=True,
    )
    admin.roles = [admin_role]
    db.add(admin)
    log.info("seed.admin.created", email=admin.email)


async def _seed_singletons(db) -> None:
    if not await db.get(SiteConfiguration, 1):
        db.add(SiteConfiguration(
            id=1,
            site_name="Raybags — Data Engineering",
            tagline="Building self-healing data platforms & agentic AI.",
            meta_title="Raybags | Data Engineering Portfolio",
            meta_description="Production-grade data engineering, crawlers, pipelines and agentic AI.",
        ))
    if not await db.get(Theme, 1):
        db.add(Theme(id=1))  # sensible defaults from the model
    if not await db.get(HeroSection, 1):
        db.add(HeroSection(
            id=1,
            name="Raybags",
            title="Data Engineer & Platform Builder",
            subtitle="Crawlers, pipelines, agentic AI — production-grade, self-healing.",
            cta_text="View Projects",
            cta_url="#projects",
            background_mode="gradient",
        ))
    if not await db.get(AboutMe, 1):
        db.add(AboutMe(
            id=1,
            heading="About",
            biography="I design and operate modular data platforms.",
            description="From crawlers to dashboards, end to end.",
        ))


async def _seed_socials(db) -> None:
    if await db.scalar(select(SocialLink.id)):
        return
    db.add_all([
        SocialLink(platform="GitHub", url="https://github.com/raybags-dev", icon="github", order=1),
        SocialLink(platform="LinkedIn", url="https://linkedin.com/in/raybags", icon="linkedin", order=2),
        SocialLink(platform="Email", url="mailto:baguma.github@gmail.com", icon="mail", order=3),
    ])


async def _seed_sample_content(db) -> None:
    if not await db.scalar(select(Skill.id)):
        db.add_all([
            Skill(name="Python", category="Languages", proficiency=95, order=1),
            Skill(name="FastAPI", category="Backend", proficiency=92, order=2),
            Skill(name="PostgreSQL", category="Data", proficiency=88, order=3),
            Skill(name="Kafka", category="Streaming", proficiency=80, order=4),
            Skill(name="DBT", category="Data", proficiency=82, order=5),
            Skill(name="Next.js", category="Frontend", proficiency=85, order=6),
        ])
    if not await db.scalar(select(Project.id)):
        db.add(Project(
            title="Self-Healing Crawler Framework",
            slug="self-healing-crawlers",
            summary="Crawlers that repair their own selectors with AI when sites change.",
            description="When HTML changes, an AI agent diffs the DOM, proposes new "
            "selectors, validates output, and updates the crawler config — no manual fix.",
            tech_tags=["Playwright", "LangGraph", "Polars", "PostgreSQL"],
            is_featured=True,
            status="published",
            service_key="retail",
            order=1,
        ))


async def _seed_microservices(db) -> None:
    for key, name, desc, category, flag in MICROSERVICES:
        existing = await db.scalar(select(Microservice).where(Microservice.key == key))
        if existing:
            # Upsert base_url for known integrated services
            if key == "hotel-reviews" and existing.base_url != "/hotel-reviews":
                existing.base_url = "/hotel-reviews"
            continue
        base_url = "/hotel-reviews" if key == "hotel-reviews" else None
        db.add(Microservice(
            key=key, name=name, description=desc, category=category,
            feature_flag_key=flag, status="registered", is_public=True,
            base_url=base_url,
        ))
    for key, name, desc, category, flag, url in TOOLS:
        existing = await db.scalar(select(Microservice).where(Microservice.key == key))
        if not existing:
            db.add(Microservice(
                key=key, name=name, description=desc, category=category,
                feature_flag_key=flag, status="live", is_public=True, base_url=url,
            ))
        elif existing.base_url != url:
            existing.base_url = url
        # Mirror as a portfolio Project so it shows in the Projects section too.
        proj_existing = await db.scalar(select(Project).where(Project.slug == key))
        if not proj_existing:
            db.add(Project(
                title=name,
                slug=key,
                summary=desc,
                tech_tags=["FastAPI", "Supabase", "Ollama", "React", "Docker"],
                is_featured=True,
                status="published",
                service_key=key,
                demo_url=url,
                order=0,
            ))
        elif proj_existing.demo_url != url:
            proj_existing.demo_url = url


async def seed() -> None:
    configure_logging()
    await init_models()
    async with SessionLocal() as db:
        roles = await _seed_rbac(db)
        await _seed_admin(db, roles["admin"])
        await _seed_singletons(db)
        await _seed_socials(db)
        await _seed_sample_content(db)
        await _seed_microservices(db)
        await flags.ensure_defaults(db)
        from app.api.v1.endpoints.sections import ensure_default_sections

        await ensure_default_sections(db)
        await db.commit()
    log.info("seed.complete")


if __name__ == "__main__":
    asyncio.run(seed())
