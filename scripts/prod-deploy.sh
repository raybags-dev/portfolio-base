#!/usr/bin/env bash
# =============================================================================
# prod-deploy.sh — Pull pre-built ghcr.io images and restart the stack.
#
# Called automatically by GitHub Actions (deploy.yml) after images are pushed.
# Can also be run manually on the server:
#
#   GHCR_OWNER=raybags-dev IMAGE_TAG=abc123 bash scripts/prod-deploy.sh
#   GHCR_OWNER=raybags-dev bash scripts/prod-deploy.sh           # uses :latest
#
# Required env vars:
#   GHCR_OWNER   — GitHub username / org that owns the ghcr.io packages
#
# Optional env vars:
#   GHCR_TOKEN   — GitHub token with read:packages scope (for private packages)
#   IMAGE_TAG    — image tag to deploy (default: latest)
#   REMOTE_APP   — path to the app on the server (default: /mnt/portfolio-data/app)
# =============================================================================
set -Eeuo pipefail

: "${GHCR_OWNER:?GHCR_OWNER is required (GitHub username that owns the ghcr.io packages)}"
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

# ---- 0. Log in to ghcr.io (needed when packages are private) ----
if [[ -n "${GHCR_TOKEN:-}" ]]; then
  log "Logging in to ghcr.io …"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin
  ok "ghcr.io login successful"
fi

export GHCR_OWNER IMAGE_TAG

# ---- 1. Prune stale images to free overlayfs space before pulling ----
log "Pruning unused Docker images …"
docker image prune -f || true

# ---- 2. Pull new images ----
log "Pulling ghcr.io/${GHCR_OWNER}/raybags-{backend,frontend}:${IMAGE_TAG} …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull

# ---- 3. Run migrations BEFORE starting the app ----
log "Running Alembic migrations …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  run --rm --no-deps backend alembic upgrade head
ok "Migrations complete"

# ---- 4. Start (or recreate) full stack with updated images ----
log "Starting updated stack …"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# ---- 5. Wait for backend health ----
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

# ---- 6. Quick public smoke test ----
if curl -fsS --max-time 10 https://raybags.com/api/v1/health >/dev/null 2>&1; then
  ok "raybags.com responded"
else
  log "Public health check skipped (DNS/proxy may take a moment)"
fi

echo ""
ok "Deploy complete"
echo "  Images:  ghcr.io/${GHCR_OWNER}/raybags-{backend,frontend}:${IMAGE_TAG}"
echo "  Site:    https://raybags.com"
echo "  Admin:   https://raybags.com/admin"
