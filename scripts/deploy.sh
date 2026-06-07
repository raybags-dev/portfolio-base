#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Deploy the platform to a single environment via Docker Compose.
# Builds images, runs DB migrations, brings the stack up, health-checks it,
# and rolls back to the previous images on failure.
#
# Usage: scripts/deploy.sh <test|prod> [--no-build]
#
# Env files used (first found wins): .env.<env>  then  .env
# Compose overlay: docker-compose.yml + docker-compose.<env>.yml (if present)
# -----------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ENVIRONMENT="${1:-}"
[[ "$ENVIRONMENT" == "test" || "$ENVIRONMENT" == "prod" ]] || \
  die "usage: deploy.sh <test|prod> [--no-build]"
BUILD=1
[[ "${2:-}" == "--no-build" ]] && BUILD=0

cd "$ROOT"
need docker
need curl
COMPOSE="$(compose_cmd)"

# ---- env file selection ----
ENV_FILE=".env.${ENVIRONMENT}"
[[ -f "$ENV_FILE" ]] || ENV_FILE=".env"
[[ -f "$ENV_FILE" ]] || die "no env file found (looked for .env.${ENVIRONMENT} and .env)"
log "using env file: $ENV_FILE"

# ---- compose files ----
COMPOSE_FILES=(-f docker-compose.yml)
[[ -f "docker-compose.${ENVIRONMENT}.yml" ]] && COMPOSE_FILES+=(-f "docker-compose.${ENVIRONMENT}.yml")

PROJECT="raybags-${ENVIRONMENT}"
dc() { $COMPOSE -p "$PROJECT" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" "$@"; }

# Health endpoint exposed by nginx on the published port.
PORT="$(grep -E '^HTTP_PORT=' "$ENV_FILE" | cut -d= -f2)"; PORT="${PORT:-80}"
HEALTH_URL="http://localhost:${PORT}/api/v1/health"

phase "Deploying to ${ENVIRONMENT} (project ${PROJECT})"

# ---- capture current image ids for rollback ----
log "tagging current images for rollback"
ROLLBACK_TAG="rollback-${ENVIRONMENT}"
PREV_BACKEND="$(docker images -q "${PROJECT}-backend" 2>/dev/null | head -1 || true)"
PREV_FRONTEND="$(docker images -q "${PROJECT}-frontend" 2>/dev/null | head -1 || true)"

rollback() {
  warn "deployment failed — rolling back"
  [[ -n "$PREV_BACKEND" ]] && docker tag "$PREV_BACKEND" "${PROJECT}-backend:latest" || true
  [[ -n "$PREV_FRONTEND" ]] && docker tag "$PREV_FRONTEND" "${PROJECT}-frontend:latest" || true
  dc up -d --no-build || true
  die "rolled back to previous images"
}

if (( BUILD )); then
  phase "Build images"
  dc build
fi

phase "Database migrations"
# Bring up data services first so migrations have a DB.
dc up -d postgres redis
dc run --rm backend alembic upgrade head
dc run --rm backend python -m app.seed

phase "Start services"
trap rollback ERR
dc up -d

phase "Health check"
if ! wait_for_http "$HEALTH_URL" 90 3; then
  rollback
fi
trap - ERR

ok "deployment to ${ENVIRONMENT} succeeded"
dc ps
