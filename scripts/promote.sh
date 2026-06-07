#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Full safe release pipeline: TEST gate -> deploy TEST -> smoke -> deploy PROD.
# Prod is NEVER touched unless tests pass AND the test deployment is healthy.
#
# Usage: scripts/promote.sh
# -----------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"

phase "STEP 1/4 — Test gate"
bash scripts/run-tests.sh

phase "STEP 2/4 — Deploy to TEST"
bash scripts/deploy.sh test

phase "STEP 3/4 — Smoke test TEST"
TEST_PORT="$(grep -E '^HTTP_PORT=' .env.test 2>/dev/null | cut -d= -f2)"; TEST_PORT="${TEST_PORT:-8080}"
bash scripts/smoke.sh "http://localhost:${TEST_PORT}"

phase "STEP 4/4 — Promote to PROD"
warn "test environment is green; promoting to production"
bash scripts/deploy.sh prod

phase "RELEASE COMPLETE — test passed, test env healthy, prod deployed"
