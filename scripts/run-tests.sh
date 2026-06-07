#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Full test gate. MUST pass before any deployment.
# Runs: backend lint (ruff) + backend tests (pytest) + frontend typecheck/build.
# Usage: scripts/run-tests.sh [--backend-only] [--frontend-only]
# -----------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RUN_BACKEND=1
RUN_FRONTEND=1
case "${1:-}" in
  --backend-only)  RUN_FRONTEND=0 ;;
  --frontend-only) RUN_BACKEND=0 ;;
esac

cd "$ROOT"

if (( RUN_BACKEND )); then
  phase "Backend: lint + tests"
  cd "$ROOT/backend"
  # Prefer the project venv if present, else system python.
  PY="./venv/bin/python"; [[ -x "$PY" ]] || PY="python3"
  if [[ ! -x "./venv/bin/python" ]]; then
    warn "no venv found; creating one"
    python3 -m venv venv
    PY="./venv/bin/python"
    "$PY" -m pip install -q -r requirements-dev.txt
  fi
  log "ruff check"
  "$PY" -m ruff check app tests
  log "pytest"
  "$PY" -m pytest -q
  ok "backend passed"
  cd "$ROOT"
fi

if (( RUN_FRONTEND )); then
  if [[ -f "$ROOT/frontend/package.json" ]]; then
    phase "Frontend: install + build"
    cd "$ROOT/frontend"
    need npm
    npm ci || npm install
    npm run build
    ok "frontend passed"
    cd "$ROOT"
  else
    warn "frontend/package.json not found — skipping frontend tests"
  fi
fi

phase "ALL TESTS PASSED"
