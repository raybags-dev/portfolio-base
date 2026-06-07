"""Schemas for platform control-plane entities (feature flags, services...)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.schemas.common import TimestampedRead


# ---- feature flags ----
class FeatureFlagBase(BaseModel):
    key: str
    label: str | None = None
    description: str | None = None
    enabled: bool = False
    group: str = "general"
    config: dict[str, Any] | None = None


class FeatureFlagCreate(FeatureFlagBase):
    pass


class FeatureFlagUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    enabled: bool | None = None
    group: str | None = None
    config: dict[str, Any] | None = None


class FeatureFlagRead(TimestampedRead):
    key: str
    label: str | None = None
    description: str | None = None
    enabled: bool
    group: str
    config: dict[str, Any] | None = None


# ---- microservices ----
class MicroserviceBase(BaseModel):
    key: str
    name: str
    description: str | None = None
    category: str | None = None
    icon: str | None = None
    feature_flag_key: str | None = None
    base_url: str | None = None
    health_url: str | None = None
    status: str = "registered"
    config: dict[str, Any] | None = None
    is_public: bool = True


class MicroserviceCreate(MicroserviceBase):
    pass


class MicroserviceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    icon: str | None = None
    feature_flag_key: str | None = None
    base_url: str | None = None
    health_url: str | None = None
    status: str | None = None
    config: dict[str, Any] | None = None
    is_public: bool | None = None


class MicroserviceRead(TimestampedRead):
    key: str
    name: str
    description: str | None = None
    category: str | None = None
    icon: str | None = None
    feature_flag_key: str | None = None
    base_url: str | None = None
    status: str
    is_public: bool
    config: dict[str, Any] | None = None
    # resolved at read time from the feature flag, if any
    enabled: bool = True
