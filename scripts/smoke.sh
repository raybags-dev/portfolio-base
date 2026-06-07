#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Post-deploy smoke tests against a running base URL.
# Verifies the critical public surface responds correctly.
# Usage: scripts/smoke.sh <base_url>   e.g. scripts/smoke.sh http://localhost:8080
# -----------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BASE="${1:?usage: smoke.sh <base_url>}"
need curl

check() {
  local desc="$1" url="$2" expect="${3:-200}"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo 000)"
  if [[ "$code" == "$expect" ]]; then
    ok "$desc ($code)"
  else
    die "$desc -> expected $expect, got $code ($url)"
  fi
}

phase "Smoke testing $BASE"
wait_for_http "$BASE/api/v1/health" 60 3 || die "service never became healthy"
check "health"          "$BASE/api/v1/health"
check "readiness"       "$BASE/api/v1/ready"
check "public bootstrap" "$BASE/api/v1/public/bootstrap"
check "feature flags"   "$BASE/api/v1/feature-flags/public"
check "openapi"         "$BASE/openapi.json"

# bootstrap must contain a theme block
if curl -fsS "$BASE/api/v1/public/bootstrap" | grep -q '"theme"'; then
  ok "bootstrap payload contains theme"
else
  die "bootstrap payload missing theme"
fi

phase "SMOKE TESTS PASSED"
