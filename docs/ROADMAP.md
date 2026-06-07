# Roadmap — built vs. next

This platform is built foundation-first. Below is an honest map of what is
complete and runnable today vs. what plugs in next, module-by-module, behind
feature flags. The directives describe a startup-scale product; this is the
sound core it grows from.

## ✅ Done (runnable now)

- **Backend core** — FastAPI app factory, pydantic-settings config, async
  SQLAlchemy (SQLite local / Postgres prod), JWT auth, RBAC, structlog,
  Prometheus `/metrics`, health/readiness.
- **Full data model** — 40+ tables: users/roles/permissions, all editable
  content (site config, theme, hero, about, resume, socials, media), portfolio
  (projects, skills, recommendations, timeline, experience, education,
  certifications, technologies), blog (posts/categories/tags), and the platform
  control plane (feature flags, microservices, crawler jobs/logs/results, AI
  agents/tasks, reports/templates, analytics, dashboards, scheduled jobs,
  notifications, storage files, audit/activity logs, api keys).
- **API** — auth, public `/bootstrap` aggregate, admin CRUD for every content
  collection (generic factory), singleton content editors, blog, settings store,
  user management, and the **feature-flag control plane** with runtime toggle.
- **Seed + tests** — idempotent seed (RBAC, admin, content, microservice
  catalogue, flags); pytest suite (auth, content, flags, CRUD) — all green.
- **Migrations** — Alembic, async, SQLite+Postgres, initial revision applies
  cleanly.
- **Infra** — Docker Compose with profiles (messaging/storage/monitoring),
  Nginx reverse proxy, Prometheus + Grafana provisioning.
- **CI/CD** — GitHub Actions CI (lint, tests, migration check, image build) and
  a **gated test→prod deploy** pipeline; scripted deploy with health-check and
  rollback; post-deploy smoke tests. `scripts/ship.sh` runs the whole release
  flow (local gate → commit → push → watch GitHub Actions) — no manual git.
- **Agentic AI orchestrator** (`app/modules/agents/`, `ENABLE_AGENTIC_AI`) —
  observe→reason→plan→execute→validate→retry→log→report engine with bounded
  retries and staged persistence to `agent_tasks`. Vendor-agnostic LLM
  abstraction: deterministic **offline stub** by default, OpenAI when a key is
  set. Built-in `insight` workflow + a workflow registry. API at `/agents/*`.
- **Self-healing crawler** (`app/modules/crawlers/`, `ENABLE_CRAWLERS`) — when a
  site's HTML changes and selectors break, an agent searches the new DOM for
  nodes matching the field's *value hint*, derives a stable new selector,
  verifies re-extraction, **rewrites the job's own config**, logs a
  `healing_event`, and continues — no manual fix. Dependency-light (stdlib DOM +
  pluggable fetcher) so it runs/tests fully offline; Playwright/BeautifulSoup
  swap in for production. API at `/crawlers/*`.

## 🔜 Next (plug-in modules, each behind a flag)

Each is a self-contained module under `backend/app/modules/<name>/` that checks
its feature flag and registers routes/agents/jobs. No core changes required.

1. **Frontend depth** — flesh out admin CRUD for every entity; media uploads;
   resume PDF generation; richer charts.
2. **Object storage service** (`ENABLE_STORAGE`/`ENABLE_S3`/`ENABLE_GCP`) —
   unify local/Supabase/S3/GCP behind one interface; wire `storage_files`.
3. **Scheduler** (`ENABLE_SCHEDULER`) — APScheduler/Celery worker driving
   `scheduled_jobs` (incl. recurring crawls).
4. **Crawler upgrades** — production fetchers: a Playwright fetcher for
   JS-rendered pages and a BeautifulSoup/lxml extractor (behind the existing
   `Fetcher`/`Extractor` interfaces), plus login/pagination flows.
5. **Pipelines + quality** (`ENABLE_PIPELINES`/`ENABLE_DBT`) — Polars/DuckDB/
   PyArrow transforms, DBT models, Great Expectations validation.
6. **Report generator** (`ENABLE_REPORT_GENERATOR`) — ReportLab/Jinja2/openpyxl
   → PDF/Excel/CSV/Word/JSON/MD from `report_templates`.
7. **Event bus** (`ENABLE_KAFKA`/`ENABLE_RABBITMQ`) — producers/consumers
   connecting crawlers → AI → reports.
9. **Data projects** — Retail, Hotel Reviews, Sports, Weather, News, Stocks,
   Crypto, Airline, Jobs, Energy, Social (each already registered as a
   microservice card, gated by its `ENABLE_*` flag).
10. **AI tools** (`ENABLE_AI`) — SQL assistant, data cleaner/validator, insight
    & report generators, dataset chatbot.

## Design rule

> A new data-engineering microservice can be added independently and surfaced
> through the portfolio **without modifying the core** — by registering a
> `Microservice` row + its `ENABLE_*` flag and dropping a module under
> `app/modules/`. Enabling the flag makes it appear; disabling it hides it.
