"""Blog schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.common import TimestampedRead


class CategoryBase(BaseModel):
    name: str
    slug: str
    description: str | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryRead(TimestampedRead, CategoryBase):
    pass


class TagBase(BaseModel):
    name: str
    slug: str


class TagCreate(TagBase):
    pass


class TagRead(TimestampedRead, TagBase):
    pass


class BlogPostBase(BaseModel):
    title: str
    slug: str
    excerpt: str | None = None
    content_markdown: str | None = None
    cover_image_url: str | None = None
    status: str = "draft"
    published_at: datetime | None = None
    scheduled_at: datetime | None = None
    reading_minutes: int | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    seo: dict[str, Any] | None = None
    category_id: int | None = None
    is_featured: bool = False
    service_key: str | None = None


class BlogPostCreate(BlogPostBase):
    tag_slugs: list[str] = []


class BlogPostUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    excerpt: str | None = None
    content_markdown: str | None = None
    cover_image_url: str | None = None
    status: str | None = None
    published_at: datetime | None = None
    scheduled_at: datetime | None = None
    reading_minutes: int | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    seo: dict[str, Any] | None = None
    category_id: int | None = None
    tag_slugs: list[str] | None = None
    is_featured: bool | None = None
    service_key: str | None = None


class BlogPostRead(TimestampedRead, BlogPostBase):
    category: CategoryRead | None = None
    tags: list[TagRead] = []
    like_count: int = 0
    comment_count: int = 0


class BlogPostDetail(BlogPostRead):
    related: list[BlogPostRead] = []


# ---- comments ----
class CommentCreate(BaseModel):
    author_name: str
    author_email: str | None = None
    content: str
    website: str | None = None  # honeypot — must be empty


class CommentRead(TimestampedRead):
    author_name: str
    content: str
    post_id: int


class LikeResponse(BaseModel):
    like_count: int
    liked: bool
