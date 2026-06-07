"""Blog endpoints: categories, tags, and posts (with tag resolution)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.crud_router import build_crud_router
from app.core.deps import DbSession, require_admin
from app.models.blog import BlogPost, Category, Tag
from app.schemas.blog import (
    BlogPostCreate,
    BlogPostRead,
    BlogPostUpdate,
    CategoryCreate,
    CategoryRead,
    TagCreate,
    TagRead,
)
from app.schemas.common import Page

router = APIRouter(prefix="/blog", tags=["blog"])

# categories & tags get plain CRUD
router.include_router(
    build_crud_router(
        model=Category,
        read_schema=CategoryRead,
        create_schema=CategoryCreate,
        update_schema=CategoryCreate,
        prefix="/categories",
        tags=["blog:categories"],
        order_by=Category.name,
    )
)
router.include_router(
    build_crud_router(
        model=Tag,
        read_schema=TagRead,
        create_schema=TagCreate,
        update_schema=TagCreate,
        prefix="/tags",
        tags=["blog:tags"],
        order_by=Tag.name,
    )
)


async def _resolve_tags(db, slugs: list[str]) -> list[Tag]:
    if not slugs:
        return []
    return list((await db.scalars(select(Tag).where(Tag.slug.in_(slugs)))).all())


@router.get("/posts", response_model=Page[BlogPostRead])
async def list_posts(
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: str | None = Query(None, alias="status"),
):
    stmt = select(BlogPost).order_by(BlogPost.created_at.desc())
    if status_filter:
        stmt = stmt.where(BlogPost.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.scalars(stmt.limit(limit).offset(offset))).all()
    return Page(items=rows, total=total or 0, limit=limit, offset=offset)


@router.get("/posts/{slug}", response_model=BlogPostRead)
async def get_post(slug: str, db: DbSession):
    post = await db.scalar(select(BlogPost).where(BlogPost.slug == slug))
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


@router.post(
    "/posts",
    response_model=BlogPostRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin())],
)
async def create_post(payload: BlogPostCreate, db: DbSession):
    data = payload.model_dump(exclude={"tag_slugs"})
    post = BlogPost(**data)
    post.tags = await _resolve_tags(db, payload.tag_slugs)
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


@router.put(
    "/posts/{post_id}",
    response_model=BlogPostRead,
    dependencies=[Depends(require_admin())],
)
async def update_post(post_id: int, payload: BlogPostUpdate, db: DbSession):
    post = await db.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    data = payload.model_dump(exclude_unset=True)
    if "tag_slugs" in data:
        post.tags = await _resolve_tags(db, data.pop("tag_slugs") or [])
    for field, value in data.items():
        setattr(post, field, value)
    await db.commit()
    await db.refresh(post)
    return post


@router.delete(
    "/posts/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin())],
)
async def delete_post(post_id: int, db: DbSession):
    post = await db.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    await db.delete(post)
    await db.commit()
