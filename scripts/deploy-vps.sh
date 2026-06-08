#!/usr/bin/env bash
# =============================================================================
# deploy-vps.sh — Deploy the platform to the Hetzner VPS (89.167.74.127)
#
# Flow:
#   1. Local gate  — ruff lint + pytest + frontend type-check  (skippable)
#   2. Rsync       — push code + .env.prod to server
#   3. Remote      — docker compose up --build (migrate → seed → start)
#   4. Health check
#
# Usage:
#   bash scripts/deploy-vps.sh                  # full SSL deploy (cert required)
#   bash scripts/deploy-vps.sh --bootstrap      # HTTP-only deploy (no cert needed)
#   bash scripts/deploy-vps.sh --skip-tests     # skip local test gate
#   bash scripts/deploy-vps.sh --bootstrap --skip-tests
#
# Workflow:
#   1. First time:  bash scripts/deploy-vps.sh --bootstrap  (HTTP via Cloudflare Flexible)
#   2. Get cert:    bash scripts/issue-cert.sh              (DNS-01 via Cloudflare API)
#   3. Switch SSL:  bash scripts/deploy-vps.sh              (HTTPS, Full Strict)
# =============================================================================
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"

SERVER="portfolio-server"
DATA_DIR="/mnt/portfolio-data"
REMOTE_APP="$DATA_DIR/app"
COMPOSE_FILE="docker-compose.vps.yml"
ENV_FILE=".env.prod"

BOOTSTRAP=0
SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --bootstrap)   BOOTSTRAP=1 ;;
    --skip-tests)  SKIP_TESTS=1 ;;
  esac
done

NGINX_CONF="nginx.prod.conf"
HEALTH_PATH="/api/v1/health"
if (( BOOTSTRAP )); then
  NGINX_CONF="nginx.bootstrap.conf"
  warn "Bootstrap mode — HTTP only (Cloudflare Flexible SSL). Run scripts/issue-cert.sh to upgrade to HTTPS."
fi

# ---- pre-flight checks ----
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy from .env and fill in DATABASE_URL"
grep -q "SUPABASE_DB_PASSWORD" "$ENV_FILE" && die "$ENV_FILE still has the SUPABASE_DB_PASSWORD placeholder — fill it in first"
need rsync
need ssh

# ---- 1. Local test gate ----
if (( SKIP_TESTS == 0 )); then
  phase "Local test gate"
  bash scripts/run-tests.sh
  ok "All tests passed"
else
  warn "Skipping local tests (--skip-tests)"
fi

# ---- 2. Rsync code to server ----
phase "Sync code → $SERVER:$REMOTE_APP"
ssh "$SERVER" "mkdir -p $REMOTE_APP"

rsync -avz --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='backend/venv' \
  --exclude='backend/__pycache__' \
  --exclude='backend/.pytest_cache' \
  --exclude='backend/*.db' \
  --exclude='backend/*.sqlite3' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/.next' \
  --exclude='frontend/out' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='directives.txt' \
  ./ "$SERVER:$REMOTE_APP/"

log "Syncing $ENV_FILE …"
rsync -avz "$ENV_FILE" "$SERVER:$REMOTE_APP/.env.prod"
ok "Sync complete"

# ---- 3. Remote: build + up ----
phase "Docker compose up on $SERVER"
ssh "$SERVER" NGINX_CONF="$NGINX_CONF" REMOTE_APP="$REMOTE_APP" COMPOSE_FILE="$COMPOSE_FILE" bash -s <<'REMOTE'
set -Eeuo pipefail
cd "$REMOTE_APP"

log()  { echo -e "\033[34m[$(date +%H:%M:%S)]\033[0m $*"; }
ok()   { echo -e "\033[32m✔\033[0m $*"; }

export NGINX_CONF

log "Building images (first run takes a few minutes) …"
docker compose -f "$COMPOSE_FILE" --env-file .env.prod build --pull

log "Bringing stack up …"
docker compose -f "$COMPOSE_FILE" --env-file .env.prod up -d

log "Waiting for backend health …"
elapsed=0
until docker compose -f "$COMPOSE_FILE" --env-file .env.prod \
    exec -T backend curl -fsS http://localhost:8000/api/v1/health >/dev/null 2>&1; do
  sleep 5; elapsed=$((elapsed + 5))
  if (( elapsed >= 120 )); then
    echo "Backend did not become healthy in 120s. Last logs:"
    docker compose -f "$COMPOSE_FILE" --env-file .env.prod logs --tail=50 backend
    exit 1
  fi
done
ok "Backend healthy"

docker compose -f "$COMPOSE_FILE" --env-file .env.prod ps
REMOTE

# ---- 4. Health check ----
phase "Health check"
PROTOCOL="http"
(( BOOTSTRAP )) || PROTOCOL="https"
HEALTH_URL="${PROTOCOL}://raybags.com${HEALTH_PATH}"

log "Checking $HEALTH_URL …"
elapsed=0
until curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; do
  sleep 5; elapsed=$((elapsed + 5))
  if (( elapsed >= 60 )); then
    warn "Health check timed out — DNS may still be propagating."
    warn "Verify manually: curl -fsS $HEALTH_URL"
    break
  fi
done
if curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; then
  ok "$HEALTH_URL is healthy"
fi

ok "Deploy complete"
echo ""
if (( BOOTSTRAP )); then
  echo "  Site:     http://raybags.com  (Cloudflare adds HTTPS)"
  echo "  Next:     bash scripts/issue-cert.sh  →  bash scripts/deploy-vps.sh"
else
  echo "  Site:     https://raybags.com"
  echo "  API docs: https://raybags.com/docs"
  echo "  Admin:    https://raybags.com/admin"
fi
