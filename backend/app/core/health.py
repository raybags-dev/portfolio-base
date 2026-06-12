"""Environment health — playwright browser install, /tmp cleanup, disk check.

Called at startup (best-effort, never blocks boot) and available as a
scheduled task so the server self-heals without manual intervention.

Key problem solved: WSL2 sporadically raises ENOSPC on mkdtemp('/tmp/…')
even when the root filesystem has plenty of space. Root cause is the Node.js
process that playwright-python spawns inheriting whatever TMPDIR is in effect;
if /tmp has stale playwright dirs, a race or inode quirk in WSL2 can trigger
the error. Solution:
  1. Always point TMPDIR at ~/.pw-tmp (home fs, always writable, no quirks).
  2. Clean that dir (and /tmp playwright dirs) before every crawl.
  3. Ensure chromium is installed if missing.
  4. Retry once on ENOSPC after a fresh clean.

Public surface:
  prepare_playwright()       — call before every async_playwright() context
  run_full_check()           — synchronous full sweep (call via executor)
  run_health_check_async()   — async wrapper
"""

from __future__ import annotations

import asyncio
import glob
import os
import pathlib
import shutil
import subprocess
import time
from typing import Any

from app.core.logging import get_logger

log = get_logger("health")

# All playwright temp output goes here — on the home filesystem, always writable.
PW_TMP = pathlib.Path.home() / ".pw-tmp"
_STALE_SECS = 1800   # clean dirs older than 30 min


def _set_pw_tmpdir() -> None:
    """Redirect TMPDIR to the stable home-based directory.

    Must be called before importing playwright or starting async_playwright()
    so the Node.js child process inherits the correct TMPDIR.
    """
    PW_TMP.mkdir(parents=True, exist_ok=True)
    os.environ["TMPDIR"] = str(PW_TMP)
    os.environ["TMP"]    = str(PW_TMP)
    os.environ["TEMP"]   = str(PW_TMP)


def _cleanup_pw_dirs() -> int:
    """Remove stale playwright temp dirs from ~/.pw-tmp AND /tmp. Returns count."""
    removed = 0
    now = time.time()

    patterns = [
        str(PW_TMP / "playwright-artifacts-*"),
        str(PW_TMP / "playwright_chromium*_profile-*"),
        str(PW_TMP / "playwright_chromiumdev_profile-*"),
        "/tmp/playwright-artifacts-*",
        "/tmp/playwright_chromiumdev_profile-*",
        "/tmp/playwright_chromium*_profile-*",
    ]
    for pattern in patterns:
        for path in glob.glob(pattern):
            try:
                age = now - os.path.getmtime(path)
                if age > _STALE_SECS:
                    shutil.rmtree(path, ignore_errors=True)
                    removed += 1
            except Exception:
                pass
    return removed


def prepare_playwright() -> None:
    """Call once before every async_playwright() context.

    Sets TMPDIR to ~/.pw-tmp and sweeps stale artifact dirs.
    This is the single call that prevents the WSL2 ENOSPC mkdtemp error.
    """
    _set_pw_tmpdir()
    removed = _cleanup_pw_dirs()
    if removed:
        log.info("health.pw_tmp.cleaned", removed=removed)


def _disk_stats() -> dict[str, Any]:
    stat = shutil.disk_usage("/")
    free_gb = stat.free / 1e9
    return {
        "total_gb": round(stat.total / 1e9, 1),
        "used_gb":  round(stat.used  / 1e9, 1),
        "free_gb":  round(free_gb, 1),
        "pct_used": round(stat.used / stat.total * 100, 1),
        "low_disk": free_gb < 5,
    }


def _ensure_playwright_chromium() -> dict[str, Any]:
    """Install Playwright Chromium if the executable is missing."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import]
        with sync_playwright() as p:
            exe = p.chromium.executable_path
            if os.path.exists(exe):
                return {"installed": True, "action": "none", "exe": exe}
    except Exception:
        pass

    log.info("health.playwright.installing")
    try:
        result = subprocess.run(
            ["playwright", "install", "chromium"],
            capture_output=True, text=True, timeout=300,
        )
        ok = result.returncode == 0
        if ok:
            log.info("health.playwright.installed")
        else:
            log.warning("health.playwright.install_failed", stderr=result.stderr[:500])
        return {
            "installed": ok,
            "action": "installed" if ok else "failed",
            "stderr": result.stderr[:300] if not ok else None,
        }
    except Exception as exc:
        log.warning("health.playwright.install_error", error=str(exc))
        return {"installed": False, "action": "error", "error": str(exc)}


def _clear_pip_cache_if_low() -> dict[str, Any]:
    if not _disk_stats()["low_disk"]:
        return {"cleared": False}
    try:
        subprocess.run(["pip", "cache", "purge"], capture_output=True, timeout=30)
        log.info("health.pip_cache.cleared")
        return {"cleared": True}
    except Exception as exc:
        return {"cleared": False, "error": str(exc)}


def run_full_check() -> dict[str, Any]:
    """Full synchronous health check — call via run_in_executor from async code."""
    prepare_playwright()
    results: dict[str, Any] = {}
    results["disk"]       = _disk_stats()
    results["pw_tmp"]     = {"cleaned": _cleanup_pw_dirs()}
    results["playwright"] = _ensure_playwright_chromium()
    results["pip_cache"]  = _clear_pip_cache_if_low()
    log.info("health.check.done", disk_free=results["disk"]["free_gb"])
    return results


async def run_health_check_async() -> dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, run_full_check)
