"""Schemas for editable site content (singletons + collections)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.schemas.common import ORMModel, TimestampedRead


# ---- settings (generic kv) ----
class SettingRead(TimestampedRead):
    key: str
    value: Any | None = None
    group: str
    description: str | None = None
    is_public: bool


class SettingUpsert(BaseModel):
    key: str
    value: Any | None = None
    group: str = "general"
    description: str | None = None
    is_public: bool = True


# ---- site configuration (singleton) ----
class SiteConfigurationRead(ORMModel):
    site_name: str
    tagline: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    meta_keywords: str | None = None
    og_image_url: str | None = None
    twitter_handle: str | None = None
    structured_data: dict[str, Any] | None = None
    analytics_provider: str | None = None
    analytics_id: str | None = None
    cookie_banner_enabled: bool = False
    cookie_banner_text: str | None = None
    robots_txt: str | None = None
    maintenance_mode: bool = False
    default_locale: str = "en"
    contact_email: str | None = None
    phone: str | None = None
    location_address: str | None = None
    map_embed_url: str | None = None


class SiteConfigurationUpdate(BaseModel):
    site_name: str | None = None
    tagline: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    meta_keywords: str | None = None
    og_image_url: str | None = None
    twitter_handle: str | None = None
    structured_data: dict[str, Any] | None = None
    analytics_provider: str | None = None
    analytics_id: str | None = None
    cookie_banner_enabled: bool | None = None
    cookie_banner_text: str | None = None
    robots_txt: str | None = None
    maintenance_mode: bool | None = None
    default_locale: str | None = None
    contact_email: str | None = None
    phone: str | None = None
    location_address: str | None = None
    map_embed_url: str | None = None


# ---- theme (singleton) ----
class ThemeRead(ORMModel):
    name: str
    default_mode: str
    primary_color: str
    secondary_color: str
    accent_color: str
    background_dark: str
    background_light: str
    text_dark: str
    text_light: str
    font_family: str
    heading_font_family: str | None = None
    base_font_size: str
    spacing_unit: str
    border_radius: str
    card_shadow: str
    animations_enabled: bool
    parallax_enabled: bool
    extra_tokens: dict[str, Any] | None = None


class ThemeUpdate(BaseModel):
    name: str | None = None
    default_mode: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    background_dark: str | None = None
    background_light: str | None = None
    text_dark: str | None = None
    text_light: str | None = None
    font_family: str | None = None
    heading_font_family: str | None = None
    base_font_size: str | None = None
    spacing_unit: str | None = None
    border_radius: str | None = None
    card_shadow: str | None = None
    animations_enabled: bool | None = None
    parallax_enabled: bool | None = None
    extra_tokens: dict[str, Any] | None = None


# ---- hero (singleton) ----
class HeroRead(ORMModel):
    title: str | None = None
    subtitle: str | None = None
    name: str | None = None
    cta_text: str | None = None
    cta_url: str | None = None
    hero_image_url: str | None = None
    background_image_url: str | None = None
    background_color: str | None = None
    background_mode: str = "image"
    animation: str | None = None
    parallax_speed: float = 0.4
    is_visible: bool = True
    avatar_url: str | None = None
    avatar_shape: str = "circle"


class HeroUpdate(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    name: str | None = None
    cta_text: str | None = None
    cta_url: str | None = None
    hero_image_url: str | None = None
    background_image_url: str | None = None
    background_color: str | None = None
    background_mode: str | None = None
    animation: str | None = None
    parallax_speed: float | None = None
    is_visible: bool | None = None
    avatar_url: str | None = None
    avatar_shape: str | None = None


# ---- about (singleton) ----
class AboutRead(ORMModel):
    heading: str | None = None
    biography: str | None = None
    description: str | None = None
    image_url: str | None = None
    images: list[Any] | None = None
    highlights: list[Any] | None = None
    is_visible: bool = True


class AboutUpdate(BaseModel):
    heading: str | None = None
    biography: str | None = None
    description: str | None = None
    image_url: str | None = None
    images: list[Any] | None = None
    highlights: list[Any] | None = None
    is_visible: bool | None = None


# ---- resume (singleton) ----
class ResumeRead(ORMModel):
    title: str
    pdf_url: str | None = None
    is_generated: bool
    summary: str | None = None
    is_public: bool


class ResumeUpdate(BaseModel):
    title: str | None = None
    pdf_url: str | None = None
    is_generated: bool | None = None
    summary: str | None = None
    is_public: bool | None = None


# ---- social links (collection) ----
class SocialLinkBase(BaseModel):
    platform: str
    url: str
    icon: str | None = None
    label: str | None = None
    order: int = 0
    is_visible: bool = True


class SocialLinkCreate(SocialLinkBase):
    pass


class SocialLinkUpdate(BaseModel):
    platform: str | None = None
    url: str | None = None
    icon: str | None = None
    label: str | None = None
    order: int | None = None
    is_visible: bool | None = None


class SocialLinkRead(TimestampedRead, SocialLinkBase):
    pass


# ---- sections / nav (collection) ----
class SectionBase(BaseModel):
    key: str
    label: str
    enabled: bool = True
    order: int = 0
    is_removable: bool = True
    in_nav: bool = True


class SectionCreate(SectionBase):
    pass


class SectionUpdate(BaseModel):
    label: str | None = None
    enabled: bool | None = None
    order: int | None = None
    in_nav: bool | None = None


class SectionRead(TimestampedRead, SectionBase):
    pass


# ---- media ----
class MediaRead(TimestampedRead):
    filename: str
    content_type: str
    size_bytes: int
    url: str
