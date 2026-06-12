"""Blog: posts, categories, tags (markdown + SEO + scheduling)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import PKMixin, TimestampMixin

post_tags = Table(
    "post_tags",
    Base.metadata,
    Column("post_id", ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Category(PKMixin, TimestampMixin, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(512))


class Tag(PKMixin, TimestampMixin, Base):
    __tablename__ = "tags"

    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    posts: Mapped[list[BlogPost]] = relationship(
        secondary=post_tags, back_populates="tags"
    )


class BlogPost(PKMixin, TimestampMixin, Base):
    __tablename__ = "blog_posts"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    excerpt: Mapped[str | None] = mapped_column(Text)
    content_markdown: Mapped[str | None] = mapped_column(Text)
    cover_image_url: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft|scheduled|published
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reading_minutes: Mapped[int | None] = mapped_column(Integer)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0)

    # SEO
    meta_title: Mapped[str | None] = mapped_column(String(255))
    meta_description: Mapped[str | None] = mapped_column(Text)
    seo: Mapped[dict | None] = mapped_column(JSON)

    service_key: Mapped[str | None] = mapped_column(String(64), index=True)
    project_url: Mapped[str | None] = mapped_column(String(1024))

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL")
    )
    category: Mapped[Category | None] = relationship(lazy="selectin")
    tags: Mapped[list[Tag]] = relationship(
        secondary=post_tags, back_populates="posts", lazy="selectin"
    )
    comments: Mapped[list[BlogComment]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )


class BlogComment(PKMixin, TimestampMixin, Base):
    __tablename__ = "blog_comments"

    post_id: Mapped[int] = mapped_column(
        ForeignKey("blog_posts.id", ondelete="CASCADE"), index=True
    )
    author_name: Mapped[str] = mapped_column(String(128), nullable=False)
    author_email: Mapped[str | None] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True)
    ip_address: Mapped[str | None] = mapped_column(String(64))

    post: Mapped[BlogPost] = relationship(back_populates="comments")


class BlogLike(PKMixin, TimestampMixin, Base):
    """One like per (post, fingerprint/ip) — keeps the count honest."""

    __tablename__ = "blog_likes"

    post_id: Mapped[int] = mapped_column(
        ForeignKey("blog_posts.id", ondelete="CASCADE"), index=True
    )
    fingerprint: Mapped[str] = mapped_column(String(128), index=True)
