"""Aggregate all v1 routers under a single APIRouter."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    access_tokens,
    auth,
    blog,
    collections,
    contact,
    feature_flags,
    media,
    news,
    pipeline_requests,
    public,
    sections,
    singletons,
    system,
    users,
)

api_router = APIRouter()

# system / health
api_router.include_router(system.router)
api_router.include_router(system.settings_router)

# auth & users
api_router.include_router(auth.router)
api_router.include_router(users.router)

# public read surface
api_router.include_router(public.router)

# editable content
api_router.include_router(singletons.router, prefix="/content")
api_router.include_router(collections.router)
api_router.include_router(sections.router)
api_router.include_router(media.router)
api_router.include_router(contact.router)
api_router.include_router(pipeline_requests.router)

# blog
api_router.include_router(blog.router)

# control plane
api_router.include_router(feature_flags.router)
api_router.include_router(access_tokens.router)
api_router.include_router(access_tokens.service_router)

# news feed
api_router.include_router(news.router)

# pluggable modules (always mounted; each route gated by its feature flag)
from app.modules import discover_modules  # noqa: E402

for _spec in discover_modules():
    api_router.include_router(_spec.router)
