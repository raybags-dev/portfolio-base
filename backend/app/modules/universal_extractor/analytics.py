"""Universal Data Extractor — auto-analytics engine.

Auto-detects numeric/categorical/date fields and generates chart-ready insights.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime
from typing import Any


def _to_float(v: Any) -> float | None:
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        cleaned = re.sub(r"[,$%£€\s]", "", v)
        try:
            return float(cleaned)
        except ValueError:
            pass
    return None


def _to_date(v: Any) -> datetime | None:
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(v.split("T")[0] if "T" in v else v, fmt.split("T")[0])
            except ValueError:
                pass
    return None


def _histogram(values: list[float], bins: int = 8) -> list[dict]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if lo == hi:
        return [{"range": str(lo), "count": len(values), "avg": lo}]
    step = (hi - lo) / bins
    buckets: list[dict] = []
    for i in range(bins):
        low = lo + i * step
        high = lo + (i + 1) * step
        bucket_vals = [v for v in values if low <= v < high or (i == bins - 1 and v == high)]
        if bucket_vals:
            buckets.append({
                "range": f"{low:.0f}–{high:.0f}",
                "count": len(bucket_vals),
                "avg": round(sum(bucket_vals) / len(bucket_vals), 2),
            })
    return buckets


def compute_analytics(records: list[dict], analytics_spec: dict | None = None) -> dict[str, Any]:
    if not records:
        return {"total_records": 0, "fields_found": [], "charts": [], "summary_stats": {}}

    all_fields = sorted({k for r in records for k in r.keys()})

    # ── Classify fields ───────────────────────────────────────────────────────
    numeric_fields: dict[str, list[float]] = {}
    category_fields: dict[str, list[str]] = {}
    date_fields: dict[str, list[datetime]] = {}

    for field in all_fields:
        if field in ("metadata", "raw_content", "raw_xml", "text"):
            continue
        vals = [r.get(field) for r in records if r.get(field) not in (None, "")]

        num_vals = [_to_float(v) for v in vals]
        num_clean = [v for v in num_vals if v is not None]
        if len(num_clean) >= max(2, len(vals) * 0.5):
            numeric_fields[field] = num_clean
            continue

        date_vals = [_to_date(v) for v in vals]
        date_clean = [v for v in date_vals if v is not None]
        if len(date_clean) >= max(2, len(vals) * 0.4):
            date_fields[field] = date_clean
            continue

        str_vals = [str(v).strip() for v in vals if str(v).strip()]
        unique = set(str_vals)
        if 2 <= len(unique) <= max(20, len(records) * 0.4):
            category_fields[field] = str_vals

    charts: list[dict] = []
    summary_stats: dict[str, Any] = {}

    # ── Numeric histograms ────────────────────────────────────────────────────
    for field, vals in list(numeric_fields.items())[:4]:
        buckets = _histogram(vals)
        if buckets:
            charts.append({
                "id": f"dist_{field}",
                "title": f"{field.replace('_', ' ').title()} Distribution",
                "type": "bar",
                "data": buckets,
                "x_key": "range",
                "y_key": "count",
            })
        summary_stats[field] = {
            "min": round(min(vals), 2),
            "max": round(max(vals), 2),
            "avg": round(sum(vals) / len(vals), 2),
            "count": len(vals),
        }

    # ── Category bar + pie charts ─────────────────────────────────────────────
    for field, vals in list(category_fields.items())[:4]:
        counts = Counter(vals).most_common(15)
        bar_data = [{"label": k, "count": v} for k, v in counts]
        pie_data = [{"name": k, "value": v} for k, v in counts]

        charts.append({
            "id": f"bar_{field}",
            "title": f"{field.replace('_', ' ').title()} Breakdown",
            "type": "bar",
            "data": bar_data,
            "x_key": "label",
            "y_key": "count",
        })
        charts.append({
            "id": f"pie_{field}",
            "title": f"{field.replace('_', ' ').title()} Share",
            "type": "pie",
            "data": pie_data,
            "x_key": "name",
            "y_key": "value",
        })

    # ── Date timeline ─────────────────────────────────────────────────────────
    for field, vals in list(date_fields.items())[:1]:
        by_month: dict[str, int] = {}
        for d in vals:
            key = d.strftime("%Y-%m")
            by_month[key] = by_month.get(key, 0) + 1
        if len(by_month) >= 2:
            timeline = [{"month": k, "count": v} for k, v in sorted(by_month.items())]
            charts.append({
                "id": f"timeline_{field}",
                "title": f"Records Over Time ({field})",
                "type": "line",
                "data": timeline,
                "x_key": "month",
                "y_key": "count",
            })

    return {
        "total_records": len(records),
        "fields_found": all_fields,
        "numeric_fields": list(numeric_fields.keys()),
        "category_fields": list(category_fields.keys()),
        "date_fields": list(date_fields.keys()),
        "charts": charts,
        "summary_stats": summary_stats,
    }
