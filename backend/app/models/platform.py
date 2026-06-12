"""Platform control plane: feature flags, microservices, crawlers, AI agents,
reports, analytics, scheduler, notifications, storage.

Models for the data-engineering / control surface. Their *services* land in
later sessions; the schema + admin CRUD exist now so modules plug in behind
feature flags without code changes to the core.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import PKMixin, TimestampMixin


class FeatureFlag(PKMixin, TimestampMixin, Base):
    """Runtime on/off switch for a capability or module."""

    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    label: Mapped[str | None] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(String(512))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    group: Mapped[str] = mapped_column(String(64), default="general", index=True)
    config: Mapped[dict | None] = mapped_column(JSON)


class Microservice(PKMixin, TimestampMixin, Base):
    """A pluggable data-engineering microservice/project, surfaced dynamically.

    Enabling its ``feature_flag_key`` makes it appear in the portfolio and
    exposes its routes/cards — no redeploy required.
    """

    __tablename__ = "microservices"

    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(64), index=True)
    icon: Mapped[str | None] = mapped_column(String(128))
    feature_flag_key: Mapped[str | None] = mapped_column(String(64), index=True)
    base_url: Mapped[str | None] = mapped_column(String(1024))
    health_url: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), default="registered")
    config: Mapped[dict | None] = mapped_column(JSON)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)


class CrawlerJob(PKMixin, TimestampMixin, Base):
    __tablename__ = "crawler_jobs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_key: Mapped[str | None] = mapped_column(String(64), index=True)  # e.g. amazon, booking
    start_urls: Mapped[list | None] = mapped_column(JSON, default=list)
    selectors: Mapped[dict | None] = mapped_column(JSON)  # self-healing selector config
    schedule_cron: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="idle")  # idle|running|failed|done
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    config: Mapped[dict | None] = mapped_column(JSON)

    logs: Mapped[list[CrawlerLog]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class CrawlerLog(PKMixin, TimestampMixin, Base):
    __tablename__ = "crawler_logs"

    job_id: Mapped[int] = mapped_column(
        ForeignKey("crawler_jobs.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[str] = mapped_column(String(16), default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[dict | None] = mapped_column(JSON)
    # Records AI-assisted selector recovery events for self-healing crawlers.
    healing_event: Mapped[dict | None] = mapped_column(JSON)

    job: Mapped[CrawlerJob] = relationship(back_populates="logs")


class CrawlerResult(PKMixin, TimestampMixin, Base):
    __tablename__ = "crawler_results"

    job_id: Mapped[int] = mapped_column(
        ForeignKey("crawler_jobs.id", ondelete="CASCADE"), index=True
    )
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_url: Mapped[str | None] = mapped_column(String(1024))


class AiAgent(PKMixin, TimestampMixin, Base):
    """Registered agentic-AI worker (observe→reason→plan→execute→validate)."""

    __tablename__ = "ai_agents"

    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str | None] = mapped_column(String(128))  # crawler|report|analytics|dbt
    description: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(64))
    system_prompt: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict | None] = mapped_column(JSON)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class AgentTask(PKMixin, TimestampMixin, Base):
    __tablename__ = "agent_tasks"

    agent_id: Mapped[int | None] = mapped_column(
        ForeignKey("ai_agents.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    input: Mapped[dict | None] = mapped_column(JSON)
    plan: Mapped[dict | None] = mapped_column(JSON)
    output: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    # observe|reason|plan|execute|validate|retry|done|failed
    stage: Mapped[str] = mapped_column(String(32), default="observe")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)


class ReportTemplate(PKMixin, TimestampMixin, Base):
    __tablename__ = "report_templates"

    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    format: Mapped[str] = mapped_column(String(16), default="pdf")  # pdf|excel|csv|word|json|md
    template_body: Mapped[str | None] = mapped_column(Text)  # jinja2 source
    config: Mapped[dict | None] = mapped_column(JSON)


class Report(PKMixin, TimestampMixin, Base):
    __tablename__ = "reports"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    template_key: Mapped[str | None] = mapped_column(String(64), index=True)
    format: Mapped[str] = mapped_column(String(16), default="pdf")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    file_url: Mapped[str | None] = mapped_column(String(1024))
    params: Mapped[dict | None] = mapped_column(JSON)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Analytics(PKMixin, TimestampMixin, Base):
    """Time-series / aggregate metric points feeding dashboards."""

    __tablename__ = "analytics"

    metric: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    dimension: Mapped[str | None] = mapped_column(String(128), index=True)
    value: Mapped[float] = mapped_column(default=0)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meta: Mapped[dict | None] = mapped_column(JSON)


class Dashboard(PKMixin, TimestampMixin, Base):
    __tablename__ = "dashboards"

    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    layout: Mapped[dict | None] = mapped_column(JSON)  # widget definitions
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)


class ScheduledJob(PKMixin, TimestampMixin, Base):
    __tablename__ = "scheduled_jobs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    task: Mapped[str] = mapped_column(String(128), nullable=False)  # dotted task path/key
    cron: Mapped[str | None] = mapped_column(String(64))
    interval_seconds: Mapped[int | None] = mapped_column(Integer)
    args: Mapped[dict | None] = mapped_column(JSON)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="scheduled")


class Notification(PKMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    level: Mapped[str] = mapped_column(String(16), default="info")
    channel: Mapped[str] = mapped_column(String(32), default="in_app")  # in_app|email
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    data: Mapped[dict | None] = mapped_column(JSON)


class ContactMessage(PKMixin, TimestampMixin, Base):
    """Inbound message from the public Contact form."""

    __tablename__ = "contact_messages"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)  # emailed out?


class StorageFile(PKMixin, TimestampMixin, Base):
    __tablename__ = "storage_files"

    key: Mapped[str] = mapped_column(String(512), index=True, nullable=False)
    bucket: Mapped[str | None] = mapped_column(String(128))
    provider: Mapped[str] = mapped_column(String(32), default="local")  # local|supabase|s3|gcp
    url: Mapped[str | None] = mapped_column(String(1024))
    content_type: Mapped[str | None] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    meta: Mapped[dict | None] = mapped_column(JSON)


class HotelCrawlSession(PKMixin, TimestampMixin, Base):
    __tablename__ = "hotel_crawl_sessions"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    collection_prompt: Mapped[str] = mapped_column(Text, nullable=False)  # "collect all hotels in California"
    analytics_spec: Mapped[dict] = mapped_column(JSON, default=dict)
    max_pages: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending|running|done|failed
    progress: Mapped[dict] = mapped_column(JSON, default=dict)
    analytics_result: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    session_contact: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    records: Mapped[list[HotelCrawlRecord]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class HotelCrawlRecord(PKMixin, TimestampMixin, Base):
    __tablename__ = "hotel_crawl_records"

    session_id: Mapped[int] = mapped_column(
        ForeignKey("hotel_crawl_sessions.id", ondelete="CASCADE"), index=True
    )
    source_url: Mapped[str | None] = mapped_column(String(2048))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    validation_errors: Mapped[list | None] = mapped_column(JSON)

    session: Mapped[HotelCrawlSession] = relationship(back_populates="records")


class JobCrawlSession(PKMixin, TimestampMixin, Base):
    __tablename__ = "job_crawl_sessions"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    collection_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    analytics_spec: Mapped[dict] = mapped_column(JSON, default=dict)
    max_pages: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    progress: Mapped[dict] = mapped_column(JSON, default=dict)
    analytics_result: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    session_contact: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    records: Mapped[list[JobCrawlRecord]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class JobCrawlRecord(PKMixin, TimestampMixin, Base):
    __tablename__ = "job_crawl_records"

    session_id: Mapped[int] = mapped_column(
        ForeignKey("job_crawl_sessions.id", ondelete="CASCADE"), index=True
    )
    source_url: Mapped[str | None] = mapped_column(String(2048))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    validation_errors: Mapped[list | None] = mapped_column(JSON)

    session: Mapped[JobCrawlSession] = relationship(back_populates="records")


class UDESession(PKMixin, TimestampMixin, Base):
    """Universal Data Extractor — extraction session."""
    __tablename__ = "ude_sessions"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), default="auto")
    source_type_detected: Mapped[str | None] = mapped_column(String(32))
    extraction_prompt: Mapped[str] = mapped_column(Text, default="Extract all structured data.")
    source_config: Mapped[dict] = mapped_column(JSON, default=dict)
    analytics_spec: Mapped[dict] = mapped_column(JSON, default=dict)
    max_records: Mapped[int] = mapped_column(Integer, default=1000)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    progress: Mapped[dict] = mapped_column(JSON, default=dict)
    analytics_result: Mapped[dict | None] = mapped_column(JSON)
    schema_detected: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    session_contact: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_s3_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    mongodb_collection: Mapped[str | None] = mapped_column(String(128), nullable=True)

    records: Mapped[list[UDERecord]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class UDERecord(PKMixin, TimestampMixin, Base):
    """Universal Data Extractor — individual extracted record."""
    __tablename__ = "ude_records"

    session_id: Mapped[int] = mapped_column(
        ForeignKey("ude_sessions.id", ondelete="CASCADE"), index=True
    )
    source_url: Mapped[str | None] = mapped_column(String(4096))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    normalised_data: Mapped[dict | None] = mapped_column(JSON)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    validation_errors: Mapped[list | None] = mapped_column(JSON)

    session: Mapped[UDESession] = relationship(back_populates="records")


class AppToken(PKMixin, TimestampMixin, Base):
    """Single-use access token generated by admin for second-run authorisation."""

    __tablename__ = "app_tokens"

    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    used_by_ip: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)


class IpUsageLog(PKMixin, TimestampMixin, Base):
    """Records the first time a given IP runs a given app (free pass)."""

    __tablename__ = "ip_usage_logs"

    ip: Mapped[str] = mapped_column(String(64), index=True)
    app_name: Mapped[str] = mapped_column(String(64))

    __table_args__ = (UniqueConstraint("ip", "app_name", name="uq_ip_app_usage"),)
