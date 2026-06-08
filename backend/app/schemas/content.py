"""Schemas for editable site content (singletons + collections)."""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, field_validator

from app.schemas.common import ORMModel, TimestampedRead

_IFRAME_SRC_RE = re.compile(r'src=["\']([^"\']+)["\']', re.IGNORECASE)
# Accepts both the standard embed URL and the old maps.google.com variant
_MAPS_EMBED_RE = re.compile(
    r"^https://(www\.google\.com/maps/embed|maps\.google\.com/maps)",
    re.IGNORECASE,
)


def sanitize_map_embed(value: str | None) -> str | None:
    """Accept a full <iframe> snippet or a bare URL; return a validated embed src.

    Raises ValueError for non-empty values that aren't a Google Maps embed URL,
    so the admin gets a clear validation message instead of a broken map.
    """
    if value is None:
        return None
    v = value.strip()
    if v == "":
        return None
    if "<iframe" in v.lower():
        m = _IFRAME_SRC_RE.search(v)
        if not m:
            raise ValueError("Could not find a src URL in the iframe snippet")
        v = m.group(1).strip()
    if not _MAPS_EMBED_RE.match(v):
        raise ValueError(
            "Must be a Google Maps embed URL (https://www.google.com/maps/embed…) "
            "or the <iframe> snippet from Google Maps → Share → Embed a map"
        )
    return v


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


class _MapSanitizerMixin(BaseModel):
    @field_validator("map_embed_url", mode="before", check_fields=False)
    @classmethod
    def _clean_map(cls, v: object) -> object:
        if isinstance(v, str):
            return sanitize_map_embed(v)
        return v


class SiteConfigurationUpdate(_MapSanitizerMixin):
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
