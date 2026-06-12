"""Pluggable data-engineering modules.

Each module lives in ``app/modules/<name>/`` and exposes a ``router`` (FastAPI
APIRouter) whose routes are gated by the module's feature flag via
``require_flag``. Modules are registered here and mounted by the API once; the
feature-flag system controls whether they actually do anything at runtime.

Add a new module by dropping a package here and appending it to ``MODULES``.
No core changes, no redeploy — flip its flag in the admin panel.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter


@dataclass(frozen=True)
class ModuleSpec:
    key: str                 # stable module key (matches Microservice.key)
    flag: str                # feature flag controlling it
    router: APIRouter
    prefix: str
    tags: list[str]


def discover_modules() -> list[ModuleSpec]:
    """Import and return all module specs. Imports are local so a broken or
    optional module never breaks core startup."""
    specs: list[ModuleSpec] = []

    from app.modules.agents.router import spec as agents_spec
    specs.append(agents_spec)

    from app.modules.crawlers.router import spec as crawlers_spec
    specs.append(crawlers_spec)

    from app.modules.scheduler.router import spec as scheduler_spec
    specs.append(scheduler_spec)

    from app.modules.hotel_reviews.router import spec as hotel_reviews_spec
    specs.append(hotel_reviews_spec)

    from app.modules.jobs.router import spec as jobs_spec
    specs.append(jobs_spec)

    from app.modules.universal_extractor.router import spec as ude_spec
    specs.append(ude_spec)

    return specs
