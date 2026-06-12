"""Environment health — playwright browser install, /tmp cleanup, disk check.

Called at startup (best-effort, never blocks boot) and available as a
scheduled task so the server self-heals without manual intervention.
"""

from __future__ import annotations

import asyncio
import glob
import os
import shutil
import subprocess
import time
from typing import Any

from app.core.logging import get_logger

log = get_logger("health")

# Playwright artifact dirs in /tmp older than this are considered stale.
_STALE_SECS = 3600  # 1 hour


def _cleanup_playwright_tmp() -> dict[str, int]:
    """Remove stale playwright-* dirs from /tmp. Returns counts."""
    removed = 0
    failed = 0
    now = time.time()

    patterns = [
        "/tmp/playwright-artifacts-*",
        "/tmp/playwright_chromiumdev_profile-*",
        "/tmp/playwright_chromium_profile-*",
    ]
    for pattern in patterns:
        for path in glob.glob(pattern):
            try:
                mtime = os.path.getmtime(path)
                if now - mtime > _STALE_SECS:
                    shutil.rmtree(path, ignore_errors=True)
                    removed += 1
                    log.info("health.tmp.removed", path=path)
            except Exception as exc:
                log.warning("health.tmp.remove_failed", path=path, error=str(exc))
                failed += 1

    return {"removed": removed, "failed": failed}


def _disk_stats() -> dict[str, Any]:
    stat = shutil.disk_usage("/")
    total_gb = stat.total / 1e9
    used_gb  = stat.used  / 1e9
    free_gb  = stat.free  / 1e9
    pct_used = stat.used / stat.total * 100
    return {
        "total_gb": round(total_gb, 1),
        "used_gb":  round(used_gb,  1),
        "free_gb":  round(free_gb,  1),
        "pct_used": round(pct_used, 1),
        "low_disk": free_gb < 5,
    }


def _ensure_playwright_chromium() -> dict[str, Any]:
    """Run 'playwright install chromium' if the executable is missing."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import]

        with sync_playwright() as p:
            exe = p.chromium.executable_path
            if os.path.exists(exe):
                log.info("health.playwright.ok", exe=exe)
                return {"installed": True, "action": "none", "exe": exe}
    except Exception:
        pass

    # Browser missing — install it
    log.info("health.playwright.installing")
    try:
        result = subprocess.run(
            ["playwright", "install", "chromium"],
            capture_output=True,
            text=True,
            timeout=300,
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


def _clear_pip_cache_if_low(threshold_gb: float = 5.0) -> dict[str, Any]:
    """Clear the pip download cache only when disk is critically low."""
    disk = _disk_stats()
    if not disk["low_disk"]:
        return {"cleared": False, "reason": f"{disk['free_gb']}GB free — not needed"}
    try:
        subprocess.run(["pip", "cache", "purge"], capture_output=True, timeout=30)
        log.info("health.pip_cache.cleared")
        return {"cleared": True, "freed_approx": "up to 3.5GB"}
    except Exception as exc:
        return {"cleared": False, "error": str(exc)}


def run_full_check() -> dict[str, Any]:
    """Synchronous full health check — call via run_in_executor from async code."""
    results: dict[str, Any] = {}
    results["disk"]      = _disk_stats()
    results["tmp"]       = _cleanup_playwright_tmp()
    results["playwright"]= _ensure_playwright_chromium()
    results["pip_cache"] = _clear_pip_cache_if_low()
    log.info("health.check.done", **{k: str(v)[:120] for k, v in results.items()})
    return results


async def run_health_check_async() -> dict[str, Any]:
    """Async wrapper — safe to call from FastAPI lifespan or a task."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, run_full_check)
