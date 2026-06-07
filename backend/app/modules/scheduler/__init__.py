"""Scheduler module.

Drives the ``scheduled_jobs`` table: each row names a registered task plus an
interval or cron expression. `run_due` (offline-testable) runs jobs that are
due; an in-process async ticker calls it periodically when ENABLE_SCHEDULER is
on. Cron support is optional (croniter); interval scheduling is dependency-free.
"""
