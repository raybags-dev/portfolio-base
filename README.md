# Raybags - Data Engineering Platform

A production-grade, **fully data-driven** portfolio + data-engineering platform.
Every piece of content, every colour, every image, and every module is editable
at runtime from an admin panel and gated by feature flags — **nothing is
hardcoded** and **nothing needs a redeploy** to turn on or off.

This repo is built **foundation-first**: the core (API + content model + RBAC +
feature-flag control plane + frontend + infra + CI/CD) is complete and runnable
today; data-engineering microservices (crawlers, AI agents, pipelines, reports)
plug into it module-by-module behind feature flags.

---

## Architecture

```
                 Internet → Cloudflare (raybags.com)
                              │
                       Nginx reverse proxy
              ┌───────────────┴───────────────┐
        Next.js frontend                  (same origin /api)
              └───────────────┬───────────────┘
                       FastAPI backend
        ┌──────────┬──────────┼───────────┬──────────────┐
      Auth     Content API  Feature    Admin CRUD     Public API
     (JWT)    (data-driven)  Flags    (RBAC-gated)   (/public/*)
                              │
            PostgreSQL (Supabase)   ·   Redis   ·   Object storage
                              │
        Feature-flagged modules (added independently, zero core changes):
        Crawlers · Agentic AI · Pipelines · Reports · Analytics · Kafka/RabbitMQ
```

### Tech
- **Backend:** Python 3.13, FastAPI, Pydantic v2, async SQLAlchemy 2.0, Alembic,
  JWT + RBAC, structlog, Prometheus metrics.
- **Database:** SQLite locally (zero setup) → Supabase/Postgres in prod via one
  env var (`DATABASE_URL`). Migrations are Postgres-first, SQLite-compatible.
- **Frontend:** Next.js + TypeScript + Tailwind + Framer Motion (data-driven).
- **Infra:** Docker Compose (profiles for messaging/storage/monitoring), Nginx,
  Prometheus + Grafana, GitHub Actions CI + gated test→prod deploy.

---

## Quickstart (local, no Docker)

```bash
cp .env.example .env            # tweak if you like; SQLite default needs nothing
./start-all.sh                  # creates venv, seeds DB, runs API (+ frontend if present)
```

- API docs:   http://localhost:8000/docs
- Public data: http://localhost:8000/api/v1/public/bootstrap
- Admin login: `admin@raybags.com` / `ChangeMe!123` (from `.env`)

Backend only:

```bash
cd backend
python3 -m venv venv && ./venv/bin/pip install -r requirements-dev.txt
./venv/bin/python -m app.seed
./venv/bin/uvicorn app.main:app --reload
```

## Quickstart (Docker Compose)

```bash
cp .env.example .env            # set SECRET_KEY + FIRST_ADMIN_PASSWORD
docker compose up -d            # core stack (postgres, redis, backend, frontend, nginx)
docker compose --profile monitoring up -d   # + Prometheus/Grafana
docker compose --profile all up -d          # everything (kafka, rabbitmq, minio, monitoring)
```

App is served by Nginx on `http://localhost` (`/` → frontend, `/api` → backend).

---

## The data-driven model

`GET /api/v1/public/bootstrap` returns the **entire** public site state in one
call: site config, theme tokens, hero, about, projects, skills, recommendations,
timeline, experience, education, certifications, social links, enabled feature
flags, and the visible microservice catalogue. The frontend renders purely from
this — change it in the admin panel, the site changes. No rebuild.

### Feature flags = the control plane
Every capability is a flag (`ENABLE_CRAWLERS`, `ENABLE_AI`, `ENABLE_KAFKA`,
`ENABLE_RETAIL`, …) toggled at `PUT /api/v1/feature-flags/{key}`. A microservice
appears in the portfolio only when its flag is on. See
`backend/app/services/feature_flags.py` for the catalogue.

---

## Modules (plug-in, flag-gated)

Modules live in `backend/app/modules/<name>/`, are always mounted, but every
route is gated by a feature flag (returns 404 while off) — enable in the admin
panel, no redeploy. Two are built:

- **Agentic AI orchestrator** (`ENABLE_AGENTIC_AI`, `/api/v1/agents/*`) — an
  observe→reason→plan→execute→validate→retry→log→report engine with bounded
  retries, persisting to `agent_tasks`. LLM is vendor-agnostic: a deterministic
  **offline stub** by default, OpenAI when `OPENAI_API_KEY` is set. Run a
  workflow: `POST /agents/run {"workflow":"insight","input":{...}}`.
- **Self-healing crawler** (`ENABLE_CRAWLERS`, `/api/v1/crawlers/*`) — when a
  site's HTML changes and selectors break, it searches the new DOM for nodes
  matching the field's *value hint*, derives a stable new selector, verifies it,
  **rewrites the job's own config**, logs a `healing_event`, and continues — no
  manual fix. Runs fully offline (stdlib DOM); Playwright/BeautifulSoup swap in
  for production via the `Fetcher`/`Extractor` interfaces.

Add a module: drop a package under `app/modules/`, expose a `ModuleSpec`, append
it to `discover_modules()`, and register its `ENABLE_*` flag. That's it.

---

## Testing & deployment

The deploy path is **scripted and gated** — production is never touched unless
tests pass and a test deployment is healthy.

```bash
scripts/run-tests.sh        # full gate: ruff + pytest (+ frontend build)
scripts/deploy.sh test      # build, migrate, seed, up, health-check, rollback-on-fail
scripts/smoke.sh URL        # post-deploy smoke tests
./deploy-to-prod.sh         # test gate → deploy TEST → smoke → deploy PROD
scripts/ship.sh "msg"       # release: local gate → commit → push → watch GH Actions
```

`scripts/ship.sh` is the **only** way to commit/push — it gates on the local
test suite, commits, pushes (the push triggers CI), and (with `gh`) watches the
Actions run to pass/fail. First run: `GIT_REMOTE_URL=<repo> scripts/ship.sh "init"`.

- **CI** (`.github/workflows/ci.yml`): lint, tests, migration check, image builds
  on every push/PR.
- **Deploy** (`.github/workflows/deploy.yml`): `test → deploy-test → deploy-prod`,
  with `production` as a protected GitHub Environment (add reviewers for a manual
  approval gate). Set secrets `SSH_HOST`, `SSH_USER`, `SSH_KEY`.

---

## Repository layout

```
backend/            FastAPI app, models, schemas, migrations, tests
  app/
    core/           config, db, security, logging, deps
    models/         SQLAlchemy models (content, portfolio, blog, platform, rbac)
    schemas/        Pydantic v2 schemas
    api/v1/         routers (auth, public, content, collections, blog, flags, system)
    services/       feature flags (+ future module services)
    seed.py         idempotent seed
  alembic/          migrations
  tests/            pytest suite
frontend/           Next.js app (data-driven UI + admin panel)
scripts/            lib.sh, run-tests, deploy, promote, smoke
infra/              prometheus + grafana provisioning
docker-compose*.yml base + test/prod overlays
.github/workflows/  ci.yml, deploy.yml
```

See [docs/ROADMAP.md](docs/ROADMAP.md) for what's built vs. what plugs in next.
