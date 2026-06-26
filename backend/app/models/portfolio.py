"""Portfolio entities: projects, skills, experience, education, etc."""

from __future__ import annotations

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import PKMixin, TimestampMixin


class Technology(PKMixin, TimestampMixin, Base):
    __tablename__ = "technologies"

    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(128))
    color: Mapped[str | None] = mapped_column(String(32))
    category: Mapped[str | None] = mapped_column(String(64), index=True)


class Project(PKMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    summary: Mapped[str | None] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text)
    cover_image_url: Mapped[str | None] = mapped_column(String(1024))
    video_url: Mapped[str | None] = mapped_column(String(1024))
    github_url: Mapped[str | None] = mapped_column(String(1024))
    demo_url: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), default="published")  # draft|published|archived
    tech_tags: Mapped[list | None] = mapped_column(JSON, default=list)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    # Links a project card to a feature-flagged data-engineering microservice.
    service_key: Mapped[str | None] = mapped_column(String(64), index=True)

    images: Mapped[list[ProjectImage]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="selectin"
    )


class ProjectImage(PKMixin, TimestampMixin, Base):
    __tablename__ = "project_images"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    alt_text: Mapped[str | None] = mapped_column(String(255))
    order: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped[Project] = relationship(back_populates="images")


class Recommendation(PKMixin, TimestampMixin, Base):
    __tablename__ = "recommendations"

    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str | None] = mapped_column(String(255))
    company: Mapped[str | None] = mapped_column(String(255))
    linkedin_url: Mapped[str | None] = mapped_column(String(1024))
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    quote: Mapped[str] = mapped_column(Text, nullable=False)
    stars: Mapped[int] = mapped_column(Integer, default=5)
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)


class Skill(PKMixin, TimestampMixin, Base):
    __tablename__ = "skills"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64), index=True)
    icon: Mapped[str | None] = mapped_column(String(128))
    proficiency: Mapped[int] = mapped_column(Integer, default=80)  # 0-100
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    subheading: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    github_url: Mapped[str | None] = mapped_column(String(512))
    status: Mapped[str | None] = mapped_column(String(64))
    experience: Mapped[str | None] = mapped_column(String(64))
    primary_use: Mapped[str | None] = mapped_column(String(255))
    related_technologies: Mapped[list | None] = mapped_column(JSON, default=None)
    project_title: Mapped[str | None] = mapped_column(String(255))
    project_url: Mapped[str | None] = mapped_column(String(512))
    featured: Mapped[bool] = mapped_column(Boolean, default=False)


class TimelineEntry(PKMixin, TimestampMixin, Base):
    __tablename__ = "timeline"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(128))
    date_label: Mapped[str | None] = mapped_column(String(64))
    sort_key: Mapped[float] = mapped_column(Float, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)


class Certification(PKMixin, TimestampMixin, Base):
    __tablename__ = "certifications"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(255))
    issue_date: Mapped[str | None] = mapped_column(String(32))
    credential_url: Mapped[str | None] = mapped_column(String(1024))
    image_url: Mapped[str | None] = mapped_column(String(1024))
    order: Mapped[int] = mapped_column(Integer, default=0)


class Experience(PKMixin, TimestampMixin, Base):
    __tablename__ = "experiences"

    role: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    start_date: Mapped[str | None] = mapped_column(String(32))
    end_date: Mapped[str | None] = mapped_column(String(32))
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text)
    highlights: Mapped[list | None] = mapped_column(JSON, default=list)
    order: Mapped[int] = mapped_column(Integer, default=0)


class Education(PKMixin, TimestampMixin, Base):
    __tablename__ = "education"

    degree: Mapped[str] = mapped_column(String(255), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(255))
    field_of_study: Mapped[str | None] = mapped_column(String(255))
    start_date: Mapped[str | None] = mapped_column(String(32))
    end_date: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)
    order: Mapped[int] = mapped_column(Integer, default=0)
