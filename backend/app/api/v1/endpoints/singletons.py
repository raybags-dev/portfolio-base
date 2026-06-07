"""Admin endpoints for singleton content rows (site config, theme, hero...).

Each of these tables holds exactly one logical row (id=1). We expose
``GET`` (read) and ``PUT`` (update) and lazily create the row on first access
so the admin never hits a 404 on a fresh install.
"""
# No `from __future__ import annotations` here: `_register` assigns the
# update-schema class as a runtime parameter annotation, which must stay a
# real class object for FastAPI to build the request body.

from fastapi import APIRouter, Depends
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
