"""Application configuration.

Single source of truth for runtime settings, loaded from environment /
`.env`. Designed so the *same* image runs locally on SQLite and in prod on
Supabase/Postgres by changing only ``DATABASE_URL``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- meta ----
    PROJECT_NAME: str = "Raybags Data Platform"
    ENVIRONMENT: Literal["local", "test", "staging", "production"] = "local"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # ---- security ----
    # MUST be overridden in every non-local environment.
    SECRET_KEY: str = "dev-insecure-change-me-please-0000000000000000"
    # Emergency out-of-band token for admin credential reset (see auth router).
    CUSTOM_AUTH_TOKEN: str | None = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12        # 12h
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 14  # 14d

    # ---- database ----
    # Local default = zero-setup SQLite. Prod = Supabase pooled connection,
    # e.g. postgresql+asyncpg://USER:PASS@HOST:6543/postgres
    DATABASE_URL: str = "sqlite+aiosqlite:///./portfolio.db"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # ---- cors ----
    # Comma-separated list in env, e.g. "http://localhost:3000,https://raybags.com".
    # NoDecode stops pydantic-settings from JSON-parsing the env value so our
    # field_validator below can split the comma string itself.
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    # ---- bootstrap admin (seed) ----
    FIRST_ADMIN_EMAIL: str = "admin@raybags.com"
    FIRST_ADMIN_PASSWORD: str = "ChangeMe!123"
    FIRST_ADMIN_NAME: str = "Site Admin"

    # ---- external infra (only used when matching feature flag is on) ----
    REDIS_URL: str = "redis://localhost:6379/0"
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672//"
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"

    # ---- object storage ----
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None
    S3_BUCKET: str = "raybags-platform"
    S3_REGION: str = "eu-central-1"

    # ---- supabase (optional convenience) ----
    SUPABASE_URL: AnyHttpUrl | None = None
    SUPABASE_SERVICE_KEY: str | None = None

    # ---- AI ----
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    GROQ_API_KEY: str | None = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # ---- email / contact form (optional; messages are stored regardless) ----
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str | None = None
    SMTP_TLS: bool = True
    CONTACT_RECIPIENT: str = "baguma.github@gmail.com"

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str) and not v.startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("SUPABASE_URL", mode="before")
    @classmethod
    def _empty_url_to_none(cls, v: object) -> object:
        # `.env` keeps optional URLs as empty strings; treat them as unset.
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT in ("staging", "production")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
