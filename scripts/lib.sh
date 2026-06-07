#!/usr/bin/env bash
# Shared helpers for all platform scripts. Source this; don't execute it.
# Safe defaults: fail fast, fail on unset vars, fail on pipe errors.
set -Eeuo pipefail

# ---- pretty logging ----
if [[ -t 1 ]]; then
  C_RESET="\033[0m"; C_RED="\033[31m"; C_GRN="\033[32m"; C_YEL="\033[33m"; C_BLU="\033[34m"
else
  C_RESET=""; C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""
fi

log()  { echo -e "${C_BLU}[$(date +%H:%M:%S)]${C_RESET} $*"; }
ok()   { echo -e "${C_GRN}✔${C_RESET} $*"; }
warn() { echo -e "${C_YEL}⚠${C_RESET} $*" >&2; }
die()  { echo -e "${C_RED}x${C_RESET} $*" >&2; exit 1; }

# Print a banner for a phase.
phase() { echo -e "\n${C_BLU}========== $* ==========${C_RESET}"; }

# Resolve repo root regardless of where the script is called from.
repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}
ROOT="$(repo_root)"

# Require a command to exist.
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

# Require an env var to be set & non-empty.
require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "missing required env var: $name"
}

# Pick the docker compose invocation available on this host.
compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    die "neither 'docker compose' nor 'docker-compose' is available"
  fi
}

# Poll a URL until it returns 2xx or we time out. Args: url [timeout_s] [interval_s]
wait_for_http() {
  local url="$1" timeout="${2:-60}" interval="${3:-3}" elapsed=0
  log "waiting for $url (timeout ${timeout}s)"
  until curl -fsS -o /dev/null "$url" 2>/dev/null; do
    sleep "$interval"; elapsed=$((elapsed + interval))
    if (( elapsed >= timeout )); then
      return 1
    fi
  done
  ok "healthy: $url"
}

# Trap errors with context.
trap 'die "command failed (line $LINENO): $BASH_COMMAND"' ERR
