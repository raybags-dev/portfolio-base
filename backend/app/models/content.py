"""Editable site content: configuration, theme, hero, about, resume, socials.

Everything here is admin-editable at runtime — no hardcoded text, image,
or colour ever ships in the frontend. The frontend reads these via the
public API and renders accordingly.
"""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Float,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import PKMixin, TimestampMixin


class Setting(PKMixin, TimestampMixin, Base):
    """Generic key/value settings store (typed JSON value)."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    value: Mapped[dict | None] = mapped_column(JSON)
    group: Mapped[str] = mapped_column(String(64), default="general", index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)


class SiteConfiguration(PKMixin, TimestampMixin, Base):
    """Global site identity & SEO. Single-row (id=1) singleton."""

    __tablename__ = "site_configuration"

    site_name: Mapped[str] = mapped_column(String(255), default="My Portfolio")
    tagline: Mapped[str | None] = mapped_column(String(512))
    logo_url: Mapped[str | None] = mapped_column(String(1024))
    favicon_url: Mapped[str | None] = mapped_column(String(1024))

    # SEO / social
    meta_title: Mapped[str | None] = mapped_column(String(255))
    meta_description: Mapped[str | None] = mapped_column(Text)
    meta_keywords: Mapped[str | None] = mapped_column(Text)
    og_image_url: Mapped[str | None] = mapped_column(String(1024))
    twitter_handle: Mapped[str | None] = mapped_column(String(64))
    structured_data: Mapped[dict | None] = mapped_column(JSON)

    # site behaviour
    analytics_provider: Mapped[str | None] = mapped_column(String(64))
    analytics_id: Mapped[str | None] = mapped_column(String(128))
    cookie_banner_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    cookie_banner_text: Mapped[str | None] = mapped_column(Text)
    robots_txt: Mapped[str | None] = mapped_column(Text)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    default_locale: Mapped[str] = mapped_column(String(8), default="en")

    # contact / location (used by the Contact page)
    contact_email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(64))
    location_address: Mapped[str | None] = mapped_column(String(512))
    map_embed_url: Mapped[str | None] = mapped_column(Text)  # Google Maps embed src


class Theme(PKMixin, TimestampMixin, Base):
    """Theme tokens (colours, fonts, spacing, effects). Singleton id=1.

    No colour or radius is hardcoded in the frontend; it consumes these
    tokens as CSS variables.
    """

    __tablename__ = "themes"

    name: Mapped[str] = mapped_column(String(64), default="default")
    default_mode: Mapped[str] = mapped_column(String(8), default="dark")  # dark|light

    # colours
    primary_color: Mapped[str] = mapped_column(String(32), default="#CC0202")
    secondary_color: Mapped[str] = mapped_column(String(32), default="#FF6B6B")
    accent_color: Mapped[str] = mapped_column(String(32), default="#f59e0b")
    background_dark: Mapped[str] = mapped_column(String(32), default="#0a0a0f")
    background_light: Mapped[str] = mapped_column(String(32), default="#fafafa")
    text_dark: Mapped[str] = mapped_column(String(32), default="#e5e7eb")
    text_light: Mapped[str] = mapped_column(String(32), default="#111827")

    # typography & layout
    font_family: Mapped[str] = mapped_column(String(128), default="Inter, sans-serif")
    heading_font_family: Mapped[str | None] = mapped_column(String(128))
    base_font_size: Mapped[str] = mapped_column(String(16), default="16px")
    spacing_unit: Mapped[str] = mapped_column(String(16), default="1rem")
    border_radius: Mapped[str] = mapped_column(String(16), default="0.75rem")
    card_shadow: Mapped[str] = mapped_column(String(128), default="0 8px 30px rgba(0,0,0,0.12)")

    # motion
    animations_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    parallax_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    extra_tokens: Mapped[dict | None] = mapped_column(JSON)


class HeroSection(PKMixin, TimestampMixin, Base):
    """Hero/landing block. Singleton id=1."""

    __tablename__ = "hero_section"

    title: Mapped[str | None] = mapped_column(String(255))
    subtitle: Mapped[str | None] = mapped_column(String(512))
    name: Mapped[str | None] = mapped_column(String(255))
    cta_text: Mapped[str | None] = mapped_column(String(128))
    cta_url: Mapped[str | None] = mapped_column(String(1024))

    hero_image_url: Mapped[str | None] = mapped_column(String(1024))
    background_image_url: Mapped[str | None] = mapped_column(String(1024))
    background_color: Mapped[str | None] = mapped_column(String(32))
    background_mode: Mapped[str] = mapped_column(String(16), default="image")  # image|color|gradient
    animation: Mapped[str | None] = mapped_column(String(64), default="fade-up")
    parallax_speed: Mapped[float] = mapped_column(Float, default=0.4)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)

    # profile photo of me (rendered in the hero). If avatar_shape == "none"
    # or no url, nothing shows.
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    avatar_shape: Mapped[str] = mapped_column(String(16), default="circle")  # circle|rounded|none


class AboutMe(PKMixin, TimestampMixin, Base):
    """About section. Singleton id=1."""

    __tablename__ = "about_me"

    heading: Mapped[str | None] = mapped_column(String(255))
    biography: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(1024))
    images: Mapped[list | None] = mapped_column(JSON, default=list)
    highlights: Mapped[list | None] = mapped_column(JSON, default=list)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)


class Resume(PKMixin, TimestampMixin, Base):
    """Resume / CV: uploaded PDF or auto-generated."""

    __tablename__ = "resume"

    title: Mapped[str] = mapped_column(String(255), default="Resume")
    pdf_url: Mapped[str | None] = mapped_column(String(1024))
    is_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)


class SocialLink(PKMixin, TimestampMixin, Base):
    __tablename__ = "social_links"

    platform: Mapped[str] = mapped_column(String(64), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(64))
    label: Mapped[str | None] = mapped_column(String(128))
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)


class PortfolioImage(PKMixin, TimestampMixin, Base):
    """General media library entries used across sections."""

    __tablename__ = "portfolio_images"

    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    alt_text: Mapped[str | None] = mapped_column(String(255))
    caption: Mapped[str | None] = mapped_column(String(512))
    category: Mapped[str | None] = mapped_column(String(64), index=True)
    order: Mapped[int] = mapped_column(Integer, default=0)


class MediaAsset(PKMixin, TimestampMixin, Base):
    """Uploaded binary stored directly in the DB and served via the API.

    Storing bytes in Postgres keeps deployments stateless (no shared disk /
    volume needed) — uploads survive container restarts and work the same in
    every environment. Served at GET /api/v1/media/{id}.
    """

    __tablename__ = "media_assets"

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class Section(PKMixin, TimestampMixin, Base):
    """A toggleable, orderable site section/tab.

    The frontend builds its navigation and decides which sections to render
    from these rows — so any tab (certifications, education, experience…) can
    be removed or reordered from the admin without code changes.
    """

    __tablename__ = "sections"

    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    # Core sections (hero/contact) shouldn't be deletable; others can be removed.
    is_removable: Mapped[bool] = mapped_column(Boolean, default=True)
    in_nav: Mapped[bool] = mapped_column(Boolean, default=True)
