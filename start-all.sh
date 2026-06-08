#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Local development launcher (NO Docker required).
# Starts the FastAPI backend (SQLite) and the Next.js frontend, seeds the DB,
# and tails both. Ctrl-C stops everything.
#
# Usage: ./start-all.sh
# -----------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/scripts/lib.sh"
cd "$ROOT"

PIDS=()
cleanup() { warn "shutting down…"; for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

# ---- pre-flight: clean orphaned dev servers & free ports ----
preflight() {
  phase "Cleaning previous dev state"
  pkill -f "uvicorn app.main:app" 2>/dev/null && log "killed stray uvicorn" || true
  pkill -f "next dev" 2>/dev/null && log "killed stray next dev" || true
  pkill -f "next-server" 2>/dev/null || true
  for port in 8000 3000; do
    if command -v fuser >/dev/null 2>&1; then
      fuser -k "${port}/tcp" >/dev/null 2>&1 && log "freed port ${port}" || true
    elif command -v lsof >/dev/null 2>&1; then
      lsof -ti "tcp:${port}" 2>/dev/null | xargs -r kill 2>/dev/null || true
    fi
  done
  # remove stale Next dev locks so it never refuses to start
  [[ -d "$ROOT/frontend/.next" ]] && find "$ROOT/frontend/.next" -name "*.lock" -delete 2>/dev/null || true
  sleep 1
  ok "clean slate"
}
preflight

# ---- backend ----
phase "Backend (FastAPI @ :8000)"
cd "$ROOT/backend"
if [[ ! -x ./venv/bin/python ]]; then
  log "creating venv + installing deps"
  python3 -m venv venv
  ./venv/bin/python -m pip install -q -r requirements-dev.txt
fi
log "seeding database"
./venv/bin/python -m app.seed
log "starting uvicorn (reload)"
./venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
PIDS+=($!)
cd "$ROOT"

# ---- frontend ----
if [[ -f "$ROOT/frontend/package.json" ]]; then
  phase "Frontend (Next.js @ :3000)"
  cd "$ROOT/frontend"
  [[ -d node_modules ]] || { log "npm install"; npm install; }
  NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}" npm run dev &
  PIDS+=($!)
  cd "$ROOT"
else
  warn "frontend not set up yet — backend only"
fi

ok "API docs:  http://localhost:8000/docs"
ok "Frontend:  http://localhost:3000"
log "press Ctrl-C to stop"
wait
