"""Job-market analytics — skill demand, salary distribution, company & location ranking."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any


def _to_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip()
    m = re.search(r"[-+]?\d[\d.,]*", s)
    if not m:
        return None
    token = m.group(0)
    last_comma = token.rfind(",")
    last_dot = token.rfind(".")
    if last_comma > last_dot:
        token = token.replace(".", "").replace(",", ".")
    else:
        token = token.replace(",", "")
    try:
        return float(token)
    except ValueError:
        return None


def _parse_salary(val: Any) -> tuple[float | None, float | None]:
    """Parse '80k-120k', '$80,000 - $120,000', '80000' → (min, max) or (None, None)."""
    if not val:
        return None, None
    s = str(val).lower()
    # Expand k/K suffix before extracting numbers
    s = re.sub(r"(\d+)\s*k\b", lambda m: str(int(m.group(1)) * 1000), s)
    nums = []
    for raw in re.findall(r"\d[\d,]*", s):
        try:
            n = float(raw.replace(",", ""))
            if 5000 <= n <= 2_000_000:  # plausible annual salary range
                nums.append(n)
        except ValueError:
            pass
    if len(nums) >= 2:
        return min(nums), max(nums)
    if len(nums) == 1:
        return nums[0], nums[0]
    return None, None


def _extract_skills(records: list[dict[str, Any]]) -> list[str]:
    """Flatten all skill values from records (handles strings, lists, comma-separated)."""
    all_skills: list[str] = []
    for r in records:
        val = (
            r.get("skills")
            or r.get("required_skills")
            or r.get("tech_stack")
            or r.get("technologies")
            or r.get("requirements")
            or ""
        )
        if isinstance(val, list):
            all_skills.extend(str(s).strip() for s in val if s and str(s).strip())
        elif isinstance(val, str) and val.strip():
            parts = re.split(r"[,;|·•\n]", val)
            all_skills.extend(p.strip() for p in parts if p.strip() and len(p.strip()) <= 40)
    return all_skills


def _normalize_remote(val: str) -> str:
    v = str(val).lower()
    if any(k in v for k in ["remote", "work from home", "wfh", "fully remote", "anywhere"]):
        return "Remote"
    if any(k in v for k in ["hybrid", "partial remote", "flexible"]):
        return "Hybrid"
    if any(k in v for k in ["on-site", "onsite", "in office", "in-office", "on site", "office"]):
        return "On-site"
    return None  # type: ignore[return-value]


def _normalize_seniority(val: str) -> str | None:
    v = str(val).lower()
    if any(k in v for k in ["intern", "student", "graduate", "junior", "jr.", "entry", "associate"]):
        return "Entry / Junior"
    if any(k in v for k in ["senior", "sr.", " sr ", "staff", "principal", "lead", "architect"]):
        return "Senior+"
    if any(k in v for k in ["mid", "intermediate", "level ii", " ii ", "level 2", " 2 "]):
        return "Mid-level"
    if any(k in v for k in ["manager", "director", "vp ", "head of", "c-level", "chief"]):
        return "Leadership"
    return None


def _histogram(vals: list[float], bins: int = 8) -> list[dict[str, Any]]:
    if not vals:
        return []
    mn, mx = min(vals), max(vals)
    if mn == mx:
        lbl = f"${mn/1000:.0f}k" if mx >= 10000 else f"{mn:.0f}"
        return [{"label": lbl, "count": len(vals), "avg": mn}]
    width = (mx - mn) / bins
    buckets: list[dict[str, Any]] = []
    for i in range(bins):
        lo = mn + i * width
        hi = mn + (i + 1) * width
        bv = [v for v in vals if lo <= v < hi]
        if i == bins - 1:
            bv = [v for v in vals if lo <= v <= hi]
        if bv:
            lbl = f"${lo/1000:.0f}k–${hi/1000:.0f}k" if mx >= 10000 else f"{lo:.0f}–{hi:.0f}"
            buckets.append({"label": lbl, "count": len(bv), "avg": round(sum(bv) / len(bv), 0)})
    return buckets


def compute_analytics(
    records: list[dict[str, Any]],
    analytics_spec: dict[str, Any],  # noqa: ARG001
) -> dict[str, Any]:
    """Compute job-market chart data from extracted job listings."""
    if not records:
        return {"error": "No records to analyse", "charts": []}

    result: dict[str, Any] = {"total_records": len(records)}
    charts: list[dict[str, Any]] = []

    # ── Skill demand ─────────────────────────────────────────────────────────
    all_skills = _extract_skills(records)
    if all_skills:
        top_skills = Counter(all_skills).most_common(20)
        charts.append({
            "id": "skill_demand",
            "title": "Top Skills in Demand",
            "type": "bar",
            "data": [{"skill": s, "count": c} for s, c in top_skills],
        })
        result["unique_skills"] = len(set(all_skills))
        result["total_skill_mentions"] = len(all_skills)

    # ── Salary distribution ───────────────────────────────────────────────────
    salary_vals: list[float] = []
    for r in records:
        raw = (
            r.get("salary")
            or r.get("salary_range")
            or r.get("pay")
            or r.get("compensation")
            or ""
        )
        lo, hi = _parse_salary(raw)
        if lo is not None:
            salary_vals.append((lo + (hi or lo)) / 2)

    if salary_vals:
        buckets = _histogram(sorted(salary_vals), bins=8)
        charts.append({
            "id": "salary_distribution",
            "title": "Salary Distribution",
            "type": "bar",
            "data": [{"range": b["label"], "count": b["count"], "avg": b["avg"]} for b in buckets],
        })
        result["salary_stats"] = {
            "min": round(min(salary_vals), 0),
            "max": round(max(salary_vals), 0),
            "avg": round(sum(salary_vals) / len(salary_vals), 0),
            "count": len(salary_vals),
        }

    # ── Remote / work-type breakdown ─────────────────────────────────────────
    remote_vals = []
    for r in records:
        raw = (
            r.get("remote_type")
            or r.get("work_type")
            or r.get("work_arrangement")
            or r.get("location")
            or ""
        )
        v = _normalize_remote(str(raw))
        if v:
            remote_vals.append(v)

    if remote_vals:
        charts.append({
            "id": "remote_breakdown",
            "title": "Work Arrangement Breakdown",
            "type": "pie",
            "data": [{"name": k, "value": v} for k, v in Counter(remote_vals).most_common()],
        })

    # ── Seniority breakdown ───────────────────────────────────────────────────
    seniority_vals = []
    for r in records:
        raw = (
            r.get("seniority")
            or r.get("level")
            or r.get("experience_level")
            or r.get("title")
            or ""
        )
        v = _normalize_seniority(str(raw))
        if v:
            seniority_vals.append(v)

    if seniority_vals:
        order = ["Entry / Junior", "Mid-level", "Senior+", "Leadership"]
        counts = Counter(seniority_vals)
        charts.append({
            "id": "seniority_breakdown",
            "title": "Seniority Level Breakdown",
            "type": "pie",
            "data": [{"name": k, "value": counts[k]} for k in order if k in counts],
        })

    # ── Top hiring companies ──────────────────────────────────────────────────
    companies = [
        str(r.get("company") or r.get("employer") or r.get("organisation") or "").strip()
        for r in records
    ]
    company_counts = Counter(c for c in companies if c and c.lower() not in ("n/a", "unknown"))
    if company_counts:
        charts.append({
            "id": "top_companies",
            "title": "Top Hiring Companies",
            "type": "bar",
            "data": [{"company": c[:35], "count": n} for c, n in company_counts.most_common(15)],
        })

    # ── Top locations ─────────────────────────────────────────────────────────
    raw_locs = [str(r.get("location") or r.get("city") or "").strip() for r in records]
    clean_locs = []
    for loc in raw_locs:
        # Strip remote qualifiers embedded in location strings
        c = re.sub(
            r"\(?(remote|hybrid|on-?site|work from home|wfh)\)?",
            "",
            loc,
            flags=re.IGNORECASE,
        ).strip(" ,;–-")
        if c and len(c) > 2:
            clean_locs.append(c[:40])

    loc_counts = Counter(clean_locs)
    if loc_counts:
        charts.append({
            "id": "top_locations",
            "title": "Top Job Locations",
            "type": "bar",
            "data": [{"location": loc, "count": cnt} for loc, cnt in loc_counts.most_common(12)],
        })

    result["charts"] = charts
    result["fields_found"] = sorted(
        {k for r in records for k in r.keys()} - {"source_url"}
    )
    return result
