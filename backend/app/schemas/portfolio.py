"""Schemas for portfolio entities."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.schemas.common import TimestampedRead


# ---- technologies ----
class TechnologyBase(BaseModel):
    name: str
    icon: str | None = None
    color: str | None = None
    category: str | None = None


class TechnologyCreate(TechnologyBase):
    pass


class TechnologyRead(TimestampedRead, TechnologyBase):
    pass


# ---- project images ----
class ProjectImageRead(TimestampedRead):
    project_id: int
    url: str
    alt_text: str | None = None
    order: int = 0


# ---- projects ----
class ProjectBase(BaseModel):
    title: str
    slug: str
    summary: str | None = None
    description: str | None = None
    cover_image_url: str | None = None
    video_url: str | None = None
    github_url: str | None = None
    demo_url: str | None = None
    status: str = "published"
    tech_tags: list[Any] | None = None
    is_featured: bool = False
    is_hidden: bool = False
    order: int = 0
    service_key: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    summary: str | None = None
    description: str | None = None
    cover_image_url: str | None = None
    video_url: str | None = None
    github_url: str | None = None
    demo_url: str | None = None
    status: str | None = None
    tech_tags: list[Any] | None = None
    is_featured: bool | None = None
    is_hidden: bool | None = None
    order: int | None = None
    service_key: str | None = None


class ProjectRead(TimestampedRead, ProjectBase):
    images: list[ProjectImageRead] = []


# ---- recommendations ----
class RecommendationBase(BaseModel):
    author_name: str
    position: str | None = None
    company: str | None = None
    linkedin_url: str | None = None
    avatar_url: str | None = None
    quote: str
    stars: int = 5
    order: int = 0
    is_visible: bool = True


class RecommendationCreate(RecommendationBase):
    pass


class RecommendationUpdate(BaseModel):
    author_name: str | None = None
    position: str | None = None
    company: str | None = None
    linkedin_url: str | None = None
    avatar_url: str | None = None
    quote: str | None = None
    stars: int | None = None
    order: int | None = None
    is_visible: bool | None = None


class RecommendationRead(TimestampedRead, RecommendationBase):
    pass


# ---- skills ----
class SkillBase(BaseModel):
    name: str
    category: str | None = None
    icon: str | None = None
    proficiency: int = 80
    order: int = 0
    is_visible: bool = True
    subheading: str | None = None
    description: str | None = None
    github_url: str | None = None


class SkillCreate(SkillBase):
    pass


class SkillUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    icon: str | None = None
    proficiency: int | None = None
    order: int | None = None
    is_visible: bool | None = None
    subheading: str | None = None
    description: str | None = None
    github_url: str | None = None


class SkillRead(TimestampedRead, SkillBase):
    pass


# ---- timeline ----
class TimelineBase(BaseModel):
    title: str
    subtitle: str | None = None
    description: str | None = None
    icon: str | None = None
    date_label: str | None = None
    sort_key: float = 0
    is_visible: bool = True


class TimelineCreate(TimelineBase):
    pass


class TimelineUpdate(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    description: str | None = None
    icon: str | None = None
    date_label: str | None = None
    sort_key: float | None = None
    is_visible: bool | None = None


class TimelineRead(TimestampedRead, TimelineBase):
    pass


# ---- certifications ----
class CertificationBase(BaseModel):
    name: str
    issuer: str | None = None
    issue_date: str | None = None
    credential_url: str | None = None
    image_url: str | None = None
    order: int = 0


class CertificationCreate(CertificationBase):
    pass


class CertificationUpdate(BaseModel):
    name: str | None = None
    issuer: str | None = None
    issue_date: str | None = None
    credential_url: str | None = None
    image_url: str | None = None
    order: int | None = None


class CertificationRead(TimestampedRead, CertificationBase):
    pass


# ---- experiences ----
class ExperienceBase(BaseModel):
    role: str
    company: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    description: str | None = None
    highlights: list[Any] | None = None
    order: int = 0


class ExperienceCreate(ExperienceBase):
    pass


class ExperienceUpdate(BaseModel):
    role: str | None = None
    company: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool | None = None
    description: str | None = None
    highlights: list[Any] | None = None
    order: int | None = None


class ExperienceRead(TimestampedRead, ExperienceBase):
    pass


# ---- education ----
class EducationBase(BaseModel):
    degree: str
    institution: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None
    order: int = 0


class EducationCreate(EducationBase):
    pass


class EducationUpdate(BaseModel):
    degree: str | None = None
    institution: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None
    order: int | None = None


class EducationRead(TimestampedRead, EducationBase):
    pass
