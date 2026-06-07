#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Scripted git release — NO manual git. One command:
#   1. runs the full local test gate (ruff + pytest + frontend build)
#   2. stages + commits everything with your message
#   3. pushes to the remote (sets up origin on first run)
#   4. the push triggers GitHub Actions (CI + gated deploy); if `gh` is
#      installed & authenticated, we watch that run and report pass/fail.
#
# Usage:
#   scripts/ship.sh "commit message" [branch]
#
# First-time remote setup (only needed once):
#   GIT_REMOTE_URL=git@github.com:you/portfolio-base.git scripts/ship.sh "init"
#
# Flags:
#   SKIP_TESTS=1   skip the local gate (CI still runs remotely)  — not advised
#   NO_WATCH=1     don't wait on the GitHub Actions run
# -----------------------------------------------------------------------------
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"

MESSAGE="${1:-}"
[[ -n "$MESSAGE" ]] || die "usage: ship.sh \"commit message\" [branch]"
need git

# ---- 1. local test gate ----
if [[ "${SKIP_TESTS:-0}" == "1" ]]; then
  warn "SKIP_TESTS=1 — skipping local gate (CI will still run)"
else
  phase "Local test gate"
  bash scripts/run-tests.sh
fi

# ---- 2. branch ----
# `git branch --show-current` is clean even on an unborn branch (fresh repo),
# unlike `rev-parse HEAD` which prints "HEAD" + errors before the first commit.
BRANCH="${2:-}"
[[ -n "$BRANCH" ]] || BRANCH="$(git branch --show-current 2>/dev/null || true)"
[[ -n "$BRANCH" && "$BRANCH" != "HEAD" ]] || BRANCH="main"
log "target branch: $BRANCH"

# ---- 3. remote bootstrap (first run) ----
if ! git remote get-url origin >/dev/null 2>&1; then
  if [[ -n "${GIT_REMOTE_URL:-}" ]]; then
    log "adding origin → $GIT_REMOTE_URL"
    git remote add origin "$GIT_REMOTE_URL"
  else
    die "no 'origin' remote. Re-run once with GIT_REMOTE_URL=<repo-url> set."
  fi
fi

# Ensure we are on the target branch (create if needed). Skip when already on
# it (incl. an unborn branch of the same name on a fresh repo).
current="$(git branch --show-current 2>/dev/null || true)"
if [[ -n "$current" && "$current" != "$BRANCH" ]]; then
  git switch -c "$BRANCH" 2>/dev/null || git switch "$BRANCH"
fi

# ---- 4. commit ----
phase "Commit"
git add -A
if git diff --cached --quiet; then
  warn "nothing to commit — pushing existing commits only"
else
  git commit -m "$MESSAGE" \
             -m "🤖 shipped via scripts/ship.sh" \
             -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ok "committed"
fi

# ---- 5. push ----
phase "Push → origin/$BRANCH"
git push -u origin "$BRANCH"
ok "pushed"

# ---- 6. watch CI ----
if [[ "${NO_WATCH:-0}" == "1" ]]; then
  log "NO_WATCH=1 — not waiting on GitHub Actions"
  exit 0
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  phase "GitHub Actions"
  log "waiting for the run to register…"
  sleep 5
  RUN_ID="$(gh run list --branch "$BRANCH" --limit 1 --json databaseId \
            --jq '.[0].databaseId' 2>/dev/null || echo)"
  if [[ -n "$RUN_ID" ]]; then
    gh run watch "$RUN_ID" --exit-status && ok "CI passed" || die "CI failed — see: gh run view $RUN_ID"
  else
    warn "could not find a run yet; check: gh run list --branch $BRANCH"
  fi
else
  warn "gh CLI not installed/authenticated — skipping CI watch."
  warn "Install: https://cli.github.com/  then: gh auth login"
  log "CI is still running on GitHub; check the Actions tab."
fi
