"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app import __version__
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, engine, init_models
from app.core.logging import configure_logging, get_logger
from app.services.feature_flags import flags

log = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # On SQLite/local & test, create tables directly. Prod uses Alembic.
    if settings.is_sqlite or settings.ENVIRONMENT in ("local", "test"):
        await init_models()
        log.info("models.initialized", backend="metadata.create_all")
    # Seed the feature-flag catalogue so the control plane is never empty.
    async with SessionLocal() as db:
        added = await flags.ensure_defaults(db)
        if added:
            log.info("feature_flags.seeded", added=added)
        # Ensure the default navigable sections exist (idempotent).
        from app.api.v1.endpoints.sections import ensure_default_sections

        sec_added = await ensure_default_sections(db)
        if sec_added:
            log.info("sections.seeded", added=sec_added)
        # Seed microservice catalogue and blog posts (idempotent — skips existing keys).
        from app.seed import _seed_blog_posts, _seed_microservices

        await _seed_microservices(db)
        await _seed_blog_posts(db)
        await db.commit()
    # Start the scheduler ticker (it no-ops unless ENABLE_SCHEDULER is on, so
    # the admin can toggle scheduling at runtime). Best-effort: never block boot.
    scheduler_task = None
    try:
        from app.modules.scheduler.runner import start_ticker

        scheduler_task = start_ticker()
        app.state.scheduler_task = scheduler_task
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("scheduler.ticker.start_failed", error=str(exc))

    log.info("startup.complete", environment=settings.ENVIRONMENT, version=__version__)
    yield

    from app.modules.scheduler.runner import stop_ticker

    await stop_ticker(scheduler_task)
    await engine.dispose()
    log.info("shutdown.complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=__version__,
        description="Data Engineering Portfolio Platform — fully data-driven, "
        "modular, feature-flag controlled.",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        log.error("unhandled_exception", path=str(request.url), error=str(exc))
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.get("/", tags=["system"])
    async def root() -> dict[str, str]:
        return {
            "service": settings.PROJECT_NAME,
            "version": __version__,
            "docs": "/docs",
            "api": settings.API_V1_PREFIX,
        }

    @app.get("/metrics", tags=["system"], include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)
    return app


app = create_app()
