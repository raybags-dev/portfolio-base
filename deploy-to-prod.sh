#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Production release entrypoint.
# This is intentionally a thin, safe wrapper around the full pipeline:
#   test gate -> deploy to TEST -> smoke TEST -> deploy to PROD
# It will NOT deploy to production unless every prior step succeeds.
#
# Usage: ./deploy-to-prod.sh
#
# To deploy ONLY to prod (skipping the test stage) you must opt in explicitly:
#   FORCE_PROD_ONLY=1 ./deploy-to-prod.sh
# -----------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/scripts/lib.sh"
cd "$ROOT"

if [[ "${FORCE_PROD_ONLY:-0}" == "1" ]]; then
  warn "FORCE_PROD_ONLY set — skipping test stage (NOT recommended)"
  bash scripts/run-tests.sh
  bash scripts/deploy.sh prod
else
  bash scripts/promote.sh
fi
