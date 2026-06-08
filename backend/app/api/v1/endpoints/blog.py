"""Blog: categories, tags, posts (search/featured/related), likes, comments."""

from __future__ import annotations

import hashlib
import math

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select

from app.api.crud_router import build_crud_router
from app.core.deps import DbSession, require_admin
from app.models.blog import BlogComment, BlogLike, BlogPost, Category, Tag, post_tags
from app.schemas.blog import (
    BlogPostCreate,
    BlogPostDetail,
    BlogPostRead,
    BlogPostUpdate,
    CategoryCreate,
    CategoryRead,
    CommentCreate,
    CommentRead,
    LikeResponse,
    TagCreate,
    TagRead,
)
from app.schemas.common import Page

router = APIRouter(prefix="/blog", tags=["blog"])

# categories & tags get plain CRUD
router.include_router(
    build_crud_router(
        model=Category, read_schema=CategoryRead, create_schema=CategoryCreate,
        update_schema=CategoryCreate, prefix="/categories", tags=["blog:categories"],
        order_by=Category.name,
    )
)
router.include_router(
    build_crud_router(
        model=Tag, read_schema=TagRead, create_schema=TagCreate,
        update_schema=TagCreate, prefix="/tags", tags=["blog:tags"], order_by=Tag.name,
    )
)


# ---------- helpers ----------
def _reading_time(markdown: str | None) -> int:
    words = len((markdown or "").split())
    return max(1, math.ceil(words / 200))


async def _resolve_tags(db, slugs: list[str]) -> list[Tag]:
    if not slugs:
        return []
    return list((await db.scalars(select(Tag).where(Tag.slug.in_(slugs)))).all())


async def _comment_counts(db, post_ids: list[int]) -> dict[int, int]:
    if not post_ids:
        return {}
    rows = (
        await db.execute(
            select(BlogComment.post_id, func.count())
            .where(BlogComment.post_id.in_(post_ids), BlogComment.is_approved.is_(True))
            .group_by(BlogComment.post_id)
        )
    ).all()
    return {pid: n for pid, n in rows}


async def _attach_counts(db, posts: list[BlogPost]) -> list[BlogPost]:
    counts = await _comment_counts(db, [p.id for p in posts])
    for p in posts:
        # set a transient attribute Pydantic (from_attributes) will read
        p.comment_count = counts.get(p.id, 0)
    return posts


# ---------- public reads ----------
@router.get("/posts", response_model=Page[BlogPostRead])
async def list_posts(
    db: DbSession,
    limit: int = Query(9, ge=1, le=50),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, description="search title/excerpt/content"),
    category: str | None = Query(None, description="category slug"),
    tag: str | None = Query(None, description="tag slug"),
    featured: bool | None = Query(None),
):
    stmt = select(BlogPost).where(BlogPost.status == "published")
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(BlogPost.title.ilike(like), BlogPost.excerpt.ilike(like),
                BlogPost.content_markdown.ilike(like))
        )
    if category:
        stmt = stmt.join(Category).where(Category.slug == category)
    if tag:
        stmt = stmt.join(post_tags).join(Tag).where(Tag.slug == tag)
    if featured is not None:
        stmt = stmt.where(BlogPost.is_featured.is_(featured))
    stmt = stmt.order_by(BlogPost.published_at.desc().nullslast(),
                         BlogPost.created_at.desc())
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = list((await db.scalars(stmt.limit(limit).offset(offset))).all())
    await _attach_counts(db, rows)
    return Page(items=rows, total=total or 0, limit=limit, offset=offset)


@router.get("/posts/{slug}", response_model=BlogPostDetail)
async def get_post(slug: str, db: DbSession):
    post = await db.scalar(select(BlogPost).where(BlogPost.slug == slug))
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    await _attach_counts(db, [post])

    # related: same category or shared tags, published, excluding self
    rel_stmt = (
        select(BlogPost)
        .where(BlogPost.id != post.id, BlogPost.status == "published")
        .order_by(BlogPost.published_at.desc().nullslast())
        .limit(3)
    )
    if post.category_id:
        rel_stmt = rel_stmt.where(BlogPost.category_id == post.category_id)
    related = list((await db.scalars(rel_stmt)).all())
    await _attach_counts(db, related)

    detail = BlogPostDetail.model_validate(post)
    detail.related = [BlogPostRead.model_validate(r) for r in related]
    return detail


# ---------- likes ----------
@router.post("/posts/{slug}/like", response_model=LikeResponse)
async def like_post(slug: str, request: Request, db: DbSession):
    post = await db.scalar(select(BlogPost).where(BlogPost.slug == slug))
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    ip = request.client.host if request.client else "anon"
    fp = hashlib.sha256(f"{ip}:{post.id}".encode()).hexdigest()[:32]
    existing = await db.scalar(
        select(BlogLike).where(BlogLike.post_id == post.id, BlogLike.fingerprint == fp)
    )
    if existing:
        return LikeResponse(like_count=post.like_count, liked=True)
    db.add(BlogLike(post_id=post.id, fingerprint=fp))
    post.like_count = (post.like_count or 0) + 1
    await db.commit()
    return LikeResponse(like_count=post.like_count, liked=True)


# ---------- comments ----------
@router.get("/posts/{slug}/comments", response_model=list[CommentRead])
async def list_comments(slug: str, db: DbSession):
    post = await db.scalar(select(BlogPost).where(BlogPost.slug == slug))
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return (
        await db.scalars(
            select(BlogComment)
            .where(BlogComment.post_id == post.id, BlogComment.is_approved.is_(True))
            .order_by(BlogComment.created_at.desc())
        )
    ).all()


@router.post("/posts/{slug}/comments", response_model=CommentRead,
             status_code=status.HTTP_201_CREATED)
async def add_comment(slug: str, payload: CommentCreate, request: Request, db: DbSession):
    if payload.website:  # honeypot
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Spam detected")
    post = await db.scalar(select(BlogPost).where(BlogPost.slug == slug))
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    comment = BlogComment(
        post_id=post.id, author_name=payload.author_name,
        author_email=payload.author_email, content=payload.content,
        ip_address=request.client.host if request.client else None,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


# ---------- admin ----------
@router.get("/manage/posts", response_model=list[BlogPostRead],
            dependencies=[Depends(require_admin())])
async def manage_posts(db: DbSession):
    rows = list((await db.scalars(select(BlogPost).order_by(BlogPost.id.desc()))).all())
    await _attach_counts(db, rows)
    return rows


@router.post("/posts", response_model=BlogPostRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin())])
async def create_post(payload: BlogPostCreate, db: DbSession):
    data = payload.model_dump(exclude={"tag_slugs"})
    if not data.get("reading_minutes"):
        data["reading_minutes"] = _reading_time(data.get("content_markdown"))
    post = BlogPost(**data)
    post.tags = await _resolve_tags(db, payload.tag_slugs)
    db.add(post)
    await db.commit()
    await db.refresh(post)
    post.comment_count = 0
    return post


@router.put("/posts/{post_id}", response_model=BlogPostRead,
            dependencies=[Depends(require_admin())])
async def update_post(post_id: int, payload: BlogPostUpdate, db: DbSession):
    post = await db.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    data = payload.model_dump(exclude_unset=True)
    if "tag_slugs" in data:
        post.tags = await _resolve_tags(db, data.pop("tag_slugs") or [])
    for field, value in data.items():
        setattr(post, field, value)
    if "content_markdown" in data and not payload.reading_minutes:
        post.reading_minutes = _reading_time(post.content_markdown)
    await db.commit()
    await db.refresh(post)
    await _attach_counts(db, [post])
    return post


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin())])
async def delete_post(post_id: int, db: DbSession):
    post = await db.get(BlogPost, post_id)
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    await db.delete(post)
    await db.commit()


@router.get("/manage/comments", response_model=list[CommentRead],
            dependencies=[Depends(require_admin())])
async def manage_comments(db: DbSession):
    return (
        await db.scalars(select(BlogComment).order_by(BlogComment.created_at.desc()))
    ).all()


@router.delete("/manage/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin())])
async def delete_comment(comment_id: int, db: DbSession):
    c = await db.get(BlogComment, comment_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    await db.delete(c)
    await db.commit()
