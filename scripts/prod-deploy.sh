#!/usr/bin/env bash
# =============================================================================
# prod-deploy.sh — Pull pre-built Docker Hub images and restart the stack.
#
# Called automatically by GitHub Actions (deploy.yml) after images are pushed.
# Can also be run manually on the server:
#
#   DOCKERHUB_USERNAME=myuser IMAGE_TAG=abc123 bash scripts/prod-deploy.sh
#   DOCKERHUB_USERNAME=myuser bash scripts/prod-deploy.sh           # uses :latest
#
# Required env vars:
#   DOCKERHUB_USERNAME  — Docker Hub account that owns the images
#
# Optional env vars:
#   IMAGE_TAG           — image tag to deploy (default: latest)
#   REMOTE_APP          — path to the app on the server (default: /mnt/portfolio-data/app)
# =============================================================================
set -Eeuo pipefail

: "${DOCKERHUB_USERNAME:?DOCKERHUB_USERNAME is required (set via env or .env.prod)}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REMOTE_APP="${REMOTE_APP:-/mnt/portfolio-data/app}"
COMPOSE_FILE="docker-compose.vps.yml"
ENV_FILE=".env.prod"

# Colours
if [[ -t 1 ]]; then
  C_RESET="\033[0m"; C_RED="\033[31m"; C_GRN="\033[32m"; C_BLU="\033[34m"
else
  C_RESET=""; C_RED=""; C_GRN=""; C_BLU=""
fi
log()  { echo -e "${C_BLU}[$(date +%H:%M:%S)]${C_RESET} $*"; }
ok()   { echo -e "${C_GRN}✔${C_RESET} $*"; }
die()  { echo -e "${C_RED}✗${C_RESET} $*" >&2; exit 1; }

cd "$REMOTE_APP"

export DOCKERHUB_USERNAME IMAGE_TAG

# ---- 1. Pull new images ----
log "Pulling ${DOCKERHUB_USERNAME}/raybags-{backend,frontend}:${IMAGE_TAG} …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

# ---- 2. Run migrations BEFORE starting the app ----
# Use `run --rm` (throwaway container, no uvicorn) to avoid OOM from running
# two Python processes inside the same container simultaneously.
log "Running Alembic migrations …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  run --rm --no-deps backend alembic upgrade head
ok "Migrations complete"

# ---- 3. Start (or recreate) full stack with updated images ----
# The backend lifespan seeds microservices + blog posts on startup (idempotent).
log "Starting updated stack …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# ---- 4. Wait for backend health ----
log "Waiting for backend health …"
elapsed=0
until docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    exec -T backend curl -fsS http://localhost:8000/api/v1/health >/dev/null 2>&1; do
  sleep 5; elapsed=$((elapsed + 5))
  if (( elapsed >= 120 )); then
    echo "Backend health check timed out. Last logs:"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=60 backend
    die "deploy failed — backend unhealthy after 120 s"
  fi
done
ok "Backend healthy"

# ---- 5. Quick public smoke test ----
if curl -fsS --max-time 10 https://raybags.com/api/v1/health >/dev/null 2>&1; then
  ok "raybags.com responded"
else
  log "Public health check skipped (DNS/proxy may take a moment)"
fi

echo ""
ok "Deploy complete"
echo "  Images:  ${DOCKERHUB_USERNAME}/raybags-{backend,frontend}:${IMAGE_TAG}"
echo "  Site:    https://raybags.com"
echo "  Admin:   https://raybags.com/admin"
