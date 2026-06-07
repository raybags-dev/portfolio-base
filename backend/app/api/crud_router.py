"""Generic async CRUD router factory.

Builds a consistent REST surface for a collection model:

    GET    /            list (public)         ?limit&offset
    GET    /{id}        detail (public)
    POST   /            create (admin)
    PUT    /{id}        update (admin)
    DELETE /{id}        delete (admin)

Public reads can be filtered (e.g. only ``is_visible``/non-hidden rows) and
ordered. Keeps the per-entity endpoint files tiny while staying type-safe in
OpenAPI via the supplied Pydantic schemas.
"""
# NOTE: deliberately NOT using `from __future__ import annotations` — the
# request-body parameter annotations below are assigned dynamically from the
# create_schema/update_schema arguments and must stay real class objects
# (not stringified forward refs) for FastAPI to build their request models.

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base, get_db
from app.core.deps import require_admin
from app.schemas.common import Page


def build_crud_router(
    *,
    model: type[Base],
    read_schema: type[BaseModel],
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    prefix: str,
    tags: list[str],
    order_by: Any | None = None,
    public_filter: dict[str, Any] | None = None,
    public_list: bool = True,
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=tags)
    admin = Depends(require_admin())

    def _apply_public_filters(stmt):
        if public_filter:
            for attr, value in public_filter.items():
                stmt = stmt.where(getattr(model, attr) == value)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        return stmt

    if public_list:

        @router.get("", response_model=Page[read_schema])
        async def list_items(
            db: AsyncSession = Depends(get_db),
            limit: int = Query(50, ge=1, le=200),
            offset: int = Query(0, ge=0),
        ):
            base = _apply_public_filters(select(model))
            total = await db.scalar(
                select(func.count()).select_from(base.subquery())
            )
            rows = (await db.scalars(base.limit(limit).offset(offset))).all()
            return Page(items=rows, total=total or 0, limit=limit, offset=offset)

        @router.get("/{item_id}", response_model=read_schema)
        async def get_item(item_id: int, db: AsyncSession = Depends(get_db)):
            obj = await db.get(model, item_id)
            if obj is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
            return obj

    @router.post("", response_model=read_schema, status_code=status.HTTP_201_CREATED)
    async def create_item(
        payload: create_schema,  # type: ignore[valid-type]
        db: AsyncSession = Depends(get_db),
        _: Any = admin,
    ):
        obj = model(**payload.model_dump(exclude_unset=True))
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @router.put("/{item_id}", response_model=read_schema)
    async def update_item(
        item_id: int,
        payload: update_schema,  # type: ignore[valid-type]
        db: AsyncSession = Depends(get_db),
        _: Any = admin,
    ):
        obj = await db.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        await db.commit()
        await db.refresh(obj)
        return obj

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_item(
        item_id: int,
        db: AsyncSession = Depends(get_db),
        _: Any = admin,
    ):
        obj = await db.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        await db.delete(obj)
        await db.commit()

    return router
