"""Admin endpoints for singleton content rows (site config, theme, hero...).

Each of these tables holds exactly one logical row (id=1). We expose
``GET`` (read) and ``PUT`` (update) and lazily create the row on first access
so the admin never hits a 404 on a fresh install.
"""
# No `from __future__ import annotations` here: `_register` assigns the
# update-schema class as a runtime parameter annotation, which must stay a
# real class object for FastAPI to build the request body.

from fastapi import APIRouter, Depends
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base, get_db
from app.core.deps import require_admin
from app.models.content import AboutMe, HeroSection, Resume, SiteConfiguration, Theme
from app.schemas.content import (
    AboutRead,
    AboutUpdate,
    HeroRead,
    HeroUpdate,
    ResumeRead,
    ResumeUpdate,
    SiteConfigurationRead,
    SiteConfigurationUpdate,
    ThemeRead,
    ThemeUpdate,
)

router = APIRouter(tags=["content:singletons"])

_SKIP_COLS = {"id", "created_at", "updated_at"}


def _model_defaults(model: type[Base]) -> dict:
    """Return a dict of column-level defaults for a model, skipping PK and timestamps."""
    result = {}
    mapper = sa_inspect(model)
    for col_attr in mapper.column_attrs:
        key = col_attr.key
        if key in _SKIP_COLS:
            continue
        col = col_attr.columns[0]
        if col.default is None:
            result[key] = None
        elif callable(col.default.arg):
            result[key] = col.default.arg()
        else:
            result[key] = col.default.arg
    return result


async def get_or_create_singleton(db: AsyncSession, model: type[Base]):
    obj = await db.get(model, 1)
    if obj is None:
        obj = model(id=1)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
    return obj


def _register(path: str, model: type[Base], read_schema, update_schema) -> None:
    @router.get(path, response_model=read_schema, name=f"get_{path.strip('/')}")
    async def _get(db: AsyncSession = Depends(get_db)):
        return await get_or_create_singleton(db, model)

    @router.put(
        path,
        response_model=read_schema,
        name=f"update_{path.strip('/')}",
        dependencies=[Depends(require_admin())],
    )
    async def _put(payload: update_schema, db: AsyncSession = Depends(get_db)):  # type: ignore[valid-type]
        obj = await get_or_create_singleton(db, model)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        await db.commit()
        await db.refresh(obj)
        return obj


_register("/site-configuration", SiteConfiguration, SiteConfigurationRead, SiteConfigurationUpdate)
_register("/theme", Theme, ThemeRead, ThemeUpdate)
_register("/hero", HeroSection, HeroRead, HeroUpdate)
_register("/about", AboutMe, AboutRead, AboutUpdate)
_register("/resume", Resume, ResumeRead, ResumeUpdate)


def _add_reset(path: str, model: type[Base], read_schema) -> None:
    @router.post(
        f"{path}/reset",
        response_model=read_schema,
        name=f"reset_{path.strip('/')}",
        dependencies=[Depends(require_admin())],
    )
    async def _reset(db: AsyncSession = Depends(get_db)):
        obj = await get_or_create_singleton(db, model)
        for field, value in _model_defaults(model).items():
            setattr(obj, field, value)
        await db.commit()
        await db.refresh(obj)
        return obj


_add_reset("/site-configuration", SiteConfiguration, SiteConfigurationRead)
_add_reset("/theme", Theme, ThemeRead)
_add_reset("/hero", HeroSection, HeroRead)
_add_reset("/about", AboutMe, AboutRead)
_add_reset("/resume", Resume, ResumeRead)
