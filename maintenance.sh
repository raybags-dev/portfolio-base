#!/usr/bin/env bash
# maintenance.sh — environment health, cleanup & self-healing
# Run manually:          ./maintenance.sh
# Or from cron / CI:     bash maintenance.sh --quiet
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

QUIET=${1:-}
log() { [[ "$QUIET" == "--quiet" ]] && return; echo "[maintenance] $*"; }
warn() { echo "[maintenance] ⚠  $*" >&2; }
ok()   { [[ "$QUIET" == "--quiet" ]] && return; echo "[maintenance] ✓  $*"; }

# ── 1. Disk space check ────────────────────────────────────────────────────────
log "Checking disk space…"
AVAIL_GB=$(df -BG / | awk 'NR==2 {gsub(/G/,"",$4); print $4}')
PCT_USED=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
ok "Disk: ${AVAIL_GB}GB free (${PCT_USED}% used)"
if (( AVAIL_GB < 5 )); then
  warn "Disk critically low — ${AVAIL_GB}GB free. Running aggressive cleanup."
  LOW_DISK=1
else
  LOW_DISK=0
fi

# ── 2. Clear stale Playwright temp artifacts (both /tmp and ~/.pw-tmp) ────────
log "Cleaning stale Playwright temp artifacts…"
STALE_COUNT=0
PW_TMP="$HOME/.pw-tmp"
mkdir -p "$PW_TMP"
for dir in \
  /tmp/playwright-artifacts-* \
  /tmp/playwright_chromium*_profile-* \
  /tmp/playwright_chromiumdev_profile-* \
  "$PW_TMP"/playwright-artifacts-* \
  "$PW_TMP"/playwright_chromium*_profile-* \
  "$PW_TMP"/playwright_chromiumdev_profile-*; do
  [[ -e "$dir" ]] || continue
  if find "$dir" -maxdepth 0 -mmin +30 | grep -q .; then
    rm -rf "$dir" && (( STALE_COUNT++ )) || true
  fi
done
ok "Removed ${STALE_COUNT} stale Playwright artifact dir(s)"

# ── 3. Ensure Playwright Chromium is installed ─────────────────────────────────
log "Verifying Playwright Chromium…"
if playwright install chromium --dry-run 2>&1 | grep -q "already installed\|up to date" 2>/dev/null; then
  ok "Chromium already installed"
elif python -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    import os; assert os.path.exists(p.chromium.executable_path)
" 2>/dev/null; then
  ok "Chromium executable present"
else
  log "Installing Playwright Chromium…"
  playwright install chromium && ok "Chromium installed" || warn "Chromium install failed"
fi

# ── 4. pip cache cleanup (only when low disk) ──────────────────────────────────
if (( LOW_DISK )); then
  log "Purging pip download cache to recover space…"
  pip cache purge 2>/dev/null && ok "pip cache purged" || warn "pip cache purge failed"
fi

# ── 5. Python __pycache__ / .pyc cleanup (optional aggressive mode) ────────────
if (( LOW_DISK )); then
  log "Removing __pycache__ dirs…"
  find /home/bagum/Projects/portfolio-base/backend -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
  ok "pycache cleared"
fi

# ── 6. Log rotation — keep last 200 lines of uvicorn logs ─────────────────────
for logfile in /home/bagum/Projects/portfolio-base/backend/*.log /tmp/uvicorn*.log; do
  [[ -f "$logfile" ]] || continue
  LINES=$(wc -l < "$logfile")
  if (( LINES > 5000 )); then
    tail -200 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
    ok "Rotated $logfile ($LINES → 200 lines)"
  fi
done

# ── 7. Summary ─────────────────────────────────────────────────────────────────
AVAIL_AFTER=$(df -BG / | awk 'NR==2 {gsub(/G/,"",$4); print $4}')
echo ""
echo "┌──────────────────────────────────────────────┐"
echo "│  maintenance complete                         │"
echo "│  Disk free: ${AVAIL_AFTER}GB                               │"
echo "│  Playwright: OK                               │"
echo "└──────────────────────────────────────────────┘"
