"""Analytics engine — computes chart-ready insights from crawl records."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any


def _to_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip()
    # Find the first number-like token, supporting both 1,234.56 and 1.234,56 formats
    # Replace thousands-separator commas/dots, normalise decimal separator to "."
    # Strategy: find sequences of digits with optional separators
    m = re.search(r"[-+]?\d[\d.,]*", s)
    if not m:
        return None
    token = m.group(0)
    # Determine decimal separator: last comma or dot that is followed by 1-2 digits = decimal
    last_comma = token.rfind(",")
    last_dot = token.rfind(".")
    if last_comma > last_dot:
        # European format: 1.234,56 → remove dots, replace comma with dot
        token = token.replace(".", "").replace(",", ".")
    else:
        # US/standard format: 1,234.56 → remove commas
        token = token.replace(",", "")
    try:
        return float(token)
    except ValueError:
        return None


def compute_analytics(
    records: list[dict[str, Any]], analytics_spec: dict[str, Any]
) -> dict[str, Any]:
    """Run all requested analytics and return chart-ready data."""
    requested: list[str] = analytics_spec.get("types", [])
    result: dict[str, Any] = {}

    if not records:
        return {"error": "No records to analyse", "charts": []}

    charts: list[dict[str, Any]] = []

    # Always include a summary
    result["total_records"] = len(records)
    all_fields = set()
    for r in records:
        all_fields.update(r.keys())
    result["fields_found"] = sorted(all_fields - {"source_url"})

    # Detect numeric fields — require at least 2 parseable values (not 30%)
    numeric_fields: dict[str, list[float]] = {}
    for field in all_fields:
        vals = [_to_float(r.get(field)) for r in records]
        clean = [v for v in vals if v is not None]
        if len(clean) >= 2:
            numeric_fields[field] = clean

    # Detect text / category fields
    text_fields: dict[str, list[str]] = {}
    for field in all_fields:
        vals = [str(r.get(field, "")).strip() for r in records if r.get(field)]
        if vals and field not in numeric_fields:
            text_fields[field] = vals

    # Price distribution
    price_field = _detect_field(numeric_fields, ["price", "cost", "rate", "amount", "fee"])
    if price_field and ("price_distribution" in requested or not requested):
        vals = sorted(numeric_fields[price_field])
        buckets = _histogram(vals, bins=8)
        charts.append({
            "id": "price_distribution",
            "title": f"Price Distribution ({price_field})",
            "type": "bar",
            "data": [{"range": b["label"], "count": b["count"], "avg": b["avg"]} for b in buckets],
        })

    # Rating distribution
    rating_field = _detect_field(numeric_fields, ["rating", "score", "stars", "grade", "review_score"])
    if rating_field and ("rating_distribution" in requested or not requested):
        vals = numeric_fields[rating_field]
        buckets = _histogram(vals, bins=6)
        charts.append({
            "id": "rating_distribution",
            "title": f"Rating Distribution ({rating_field})",
            "type": "bar",
            "data": [{"range": b["label"], "count": b["count"]} for b in buckets],
        })

    # Top items by price
    if price_field and ("top_expensive" in requested or not requested):
        sorted_recs = sorted(
            [r for r in records if _to_float(r.get(price_field)) is not None],
            key=lambda r: _to_float(r.get(price_field)) or 0,
            reverse=True,
        )[:10]
        name_field = _detect_field(text_fields, ["name", "title", "hotel", "property", "listing"])
        charts.append({
            "id": "top_expensive",
            "title": "Top 10 Most Expensive",
            "type": "bar",
            "data": [
                {
                    "name": str(r.get(name_field, f"Item {i+1}"))[:30] if name_field else f"Item {i+1}",
                    "price": _to_float(r.get(price_field)) or 0,
                }
                for i, r in enumerate(sorted_recs)
            ],
        })

    # Top rated
    if rating_field and ("top_rated" in requested or not requested):
        threshold = analytics_spec.get("rating_threshold", 7.0)
        high_rated = [r for r in records if (_to_float(r.get(rating_field)) or 0) >= threshold]
        name_field = _detect_field(text_fields, ["name", "title", "hotel", "property", "listing"])
        charts.append({
            "id": "top_rated",
            "title": f"Highly Rated (>= {threshold})",
            "type": "bar",
            "data": sorted(
                [
                    {
                        "name": str(r.get(name_field, "?"))[:30] if name_field else "?",
                        "rating": _to_float(r.get(rating_field)) or 0,
                    }
                    for r in high_rated
                ],
                key=lambda x: x["rating"],
                reverse=True,
            )[:15],
        })
        result["high_rated_count"] = len(high_rated)

    # Category breakdown (pie chart)
    cat_field = _detect_field(text_fields, ["category", "type", "class", "stars", "location", "city", "area"])
    if cat_field and ("category_breakdown" in requested or not requested):
        counts = Counter(str(v)[:40] for v in text_fields[cat_field])
        top = counts.most_common(12)
        charts.append({
            "id": "category_breakdown",
            "title": f"Breakdown by {cat_field}",
            "type": "pie",
            "data": [{"name": k, "value": v} for k, v in top],
        })

    # Monthly/temporal distribution
    date_field = _detect_field(text_fields, ["date", "month", "year", "posted", "created", "review_date"])
    if date_field and ("temporal_distribution" in requested or not requested):
        monthly: Counter = Counter()
        for r in records:
            val = str(r.get(date_field, ""))
            m = re.search(r"(\d{4}[-/]\d{2}|\w+ \d{4}|\w+ '\d{2})", val)
            if m:
                monthly[m.group(1)] += 1
        if monthly:
            sorted_months = sorted(monthly.items(), key=lambda x: x[0])
            charts.append({
                "id": "temporal_distribution",
                "title": f"Reviews Over Time ({date_field})",
                "type": "line",
                "data": [{"period": k, "count": v} for k, v in sorted_months],
            })

    # Summary stats for numeric fields
    summary_stats: dict[str, Any] = {}
    for field, vals in numeric_fields.items():
        if vals:
            summary_stats[field] = {
                "min": round(min(vals), 2),
                "max": round(max(vals), 2),
                "avg": round(sum(vals) / len(vals), 2),
                "count": len(vals),
            }
    result["summary_stats"] = summary_stats
    result["charts"] = charts
    return result


def _detect_field(fields: dict[str, Any], hints: list[str]) -> str | None:
    """Find the best matching field name from hints."""
    for hint in hints:
        for field in fields:
            if hint in field.lower():
                return field
    return None


def _histogram(vals: list[float], bins: int = 8) -> list[dict[str, Any]]:
    if not vals:
        return []
    mn, mx = min(vals), max(vals)
    if mn == mx:
        return [{"label": str(mn), "count": len(vals), "avg": mn}]
    width = (mx - mn) / bins
    buckets: list[dict[str, Any]] = []
    for i in range(bins):
        lo = mn + i * width
        hi = mn + (i + 1) * width
        bucket_vals = [v for v in vals if lo <= v < hi]
        if i == bins - 1:
            bucket_vals = [v for v in vals if lo <= v <= hi]
        if bucket_vals:
            buckets.append({
                "label": f"{lo:.0f}-{hi:.0f}",
                "count": len(bucket_vals),
                "avg": round(sum(bucket_vals) / len(bucket_vals), 2),
            })
    return buckets
