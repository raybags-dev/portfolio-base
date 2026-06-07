"""Public, read-only API consumed by the frontend.

``GET /public/bootstrap`` returns everything the homepage needs in a single
round-trip — all content-driven, nothing hardcoded in the frontend.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from app.api.v1.endpoints.singletons import get_or_create_singleton
from app.core.deps import DbSession
from app.models.content import (
    AboutMe,
    HeroSection,
    Resume,
    SiteConfiguration,
    SocialLink,
    Theme,
)
from app.models.platform import FeatureFlag, Microservice
from app.models.portfolio import (
    Certification,
    Education,
    Experience,
    Project,
    Recommendation,
    Skill,
    TimelineEntry,
)

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/bootstrap")
async def bootstrap(db: DbSession) -> dict[str, Any]:
    site = await get_or_create_singleton(db, SiteConfiguration)
    theme = await get_or_create_singleton(db, Theme)
    hero = await get_or_create_singleton(db, HeroSection)
    about = await get_or_create_singleton(db, AboutMe)
    resume = await get_or_create_singleton(db, Resume)

    socials = (
        await db.scalars(
            select(SocialLink).where(SocialLink.is_visible.is_(True)).order_by(SocialLink.order)
        )
    ).all()
    projects = (
        await db.scalars(
            select(Project)
            .where(Project.is_hidden.is_(False), Project.status == "published")
            .order_by(Project.order, Project.id)
        )
    ).all()
    skills = (
        await db.scalars(
            select(Skill).where(Skill.is_visible.is_(True)).order_by(Skill.order)
        )
    ).all()
    recommendations = (
        await db.scalars(
            select(Recommendation)
            .where(Recommendation.is_visible.is_(True))
            .order_by(Recommendation.order)
        )
    ).all()
    timeline = (
        await db.scalars(
            select(TimelineEntry)
            .where(TimelineEntry.is_visible.is_(True))
            .order_by(TimelineEntry.sort_key)
        )
    ).all()
    experiences = (
        await db.scalars(select(Experience).order_by(Experience.order, Experience.id))
    ).all()
    education = (await db.scalars(select(Education).order_by(Education.order))).all()
    certifications = (
        await db.scalars(select(Certification).order_by(Certification.order))
    ).all()

    flags = {f.key: f.enabled for f in (await db.scalars(select(FeatureFlag))).all()}

    services = (
        await db.scalars(
            select(Microservice).where(Microservice.is_public.is_(True))
        )
    ).all()
    # A service is shown only if it has no flag, or its flag is enabled.
    visible_services = [
        s for s in services if not s.feature_flag_key or flags.get(s.feature_flag_key, False)
    ]

    def dump(rows):
        return [
            {c.name: getattr(r, c.name) for c in r.__table__.columns} for r in rows
        ]

    return {
        "site_configuration": {c.name: getattr(site, c.name) for c in site.__table__.columns},
        "theme": {c.name: getattr(theme, c.name) for c in theme.__table__.columns},
        "hero": {c.name: getattr(hero, c.name) for c in hero.__table__.columns},
        "about": {c.name: getattr(about, c.name) for c in about.__table__.columns},
        "resume": {c.name: getattr(resume, c.name) for c in resume.__table__.columns},
        "social_links": dump(socials),
        "projects": dump(projects),
        "skills": dump(skills),
        "recommendations": dump(recommendations),
        "timeline": dump(timeline),
        "experiences": dump(experiences),
        "education": dump(education),
        "certifications": dump(certifications),
        "feature_flags": flags,
        "microservices": dump(visible_services),
    }
