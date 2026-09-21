"""Delivery statistics: the part of the analysis that SQL is awkward at.

Everything countable is already counted by Postgres before it gets here. What
this module adds is the statistics you cannot express cleanly in a GROUP BY:
trend estimation, dispersion, percentiles and concentration.

Standard library only — PyPI is unreachable from the production server, and
`statistics` already provides linear_regression, quantiles and correlation, so
numpy would buy nothing but a dependency we cannot install.
"""

from __future__ import annotations

import statistics as stat
from datetime import date, datetime, timedelta
from typing import Any


def _round(v: float | None, n: int = 2) -> float | None:
    return None if v is None else round(float(v), n)


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except (ValueError, TypeError):
        return None


def velocity(weekly: list[float]) -> dict[str, Any]:
    """Weekly throughput: level, spread and direction.

    `stdev` matters as much as the mean: a team delivering 10,10,10 and one
    delivering 0,0,30 have the same average and completely different
    predictability, and only the spread separates them.
    """
    clean = [float(w) for w in weekly if w is not None]
    n = len(clean)
    if n == 0:
        return {"mean": 0.0, "stdev": 0.0, "weeks": 0, "slope": None, "direction": "unknown"}

    mean = stat.fmean(clean)
    stdev = stat.stdev(clean) if n >= 2 else 0.0

    slope = None
    direction = "unknown"
    # A line through two points is not a trend, it is just the two points.
    if n >= 3:
        try:
            fit = stat.linear_regression(list(range(n)), clean)
            slope = fit.slope
            # Compare the slope to the level: +2/week means something different
            # for a team doing 4 a week than for one doing 100.
            rel = slope / mean if mean else 0.0
            direction = "up" if rel > 0.1 else "down" if rel < -0.1 else "flat"
        except (stat.StatisticsError, ZeroDivisionError):
            slope = None

    return {
        "mean": _round(mean),
        "stdev": _round(stdev),
        "weeks": n,
        "slope": _round(slope),
        "direction": direction,
        # Coefficient of variation: how erratic delivery is, scale-free.
        "volatility": _round(stdev / mean, 2) if mean else None,
    }


def cycle_time(days: list[float]) -> dict[str, Any]:
    """Percentiles, not the mean: cycle times have a long right tail, and one
    task that sat for a month drags an average somewhere no task actually is."""
    clean = sorted(float(d) for d in days if d is not None and d >= 0)
    if not clean:
        return {"p50": None, "p90": None, "n": 0}
    if len(clean) < 4:
        return {"p50": _round(stat.median(clean), 1), "p90": _round(max(clean), 1), "n": len(clean)}
    q = stat.quantiles(clean, n=10, method="inclusive")
    return {
        "p50": _round(stat.median(clean), 1),
        "p90": _round(q[8], 1),
        "worst": _round(max(clean), 1),
        "n": len(clean),
    }


def gini(values: list[float]) -> float | None:
    """Concentration of load across people, 0 = perfectly even, 1 = one person
    carries everything. Used instead of max/min because a single idle newcomer
    should not read as an org-wide imbalance."""
    clean = sorted(float(v) for v in values if v is not None and v >= 0)
    n = len(clean)
    total = sum(clean)
    if n < 2 or total == 0:
        return None
    cum = sum((i + 1) * v for i, v in enumerate(clean))
    return _round((2 * cum) / (n * total) - (n + 1) / n, 3)


def workload(members: list[dict]) -> dict[str, Any]:
    """Who is carrying what, and whether that distribution is healthy."""
    active = [m for m in members if (m.get("open") or 0) + (m.get("completed4w") or 0) > 0]
    if not active:
        return {"members": [], "gini": None, "overloaded": [], "idle": []}

    opens = [float(m.get("open") or 0) for m in active]
    mean_open = stat.fmean(opens)
    stdev_open = stat.stdev(opens) if len(opens) >= 2 else 0.0

    rows = []
    for m in active:
        o = float(m.get("open") or 0)
        # z-score against the team, so "overloaded" means overloaded relative to
        # this team rather than against a number someone once guessed.
        z = (o - mean_open) / stdev_open if stdev_open else 0.0
        rows.append({
            "userId": m.get("userId"),
            "name": m.get("name"),
            "open": int(o),
            "overdue": int(m.get("overdue") or 0),
            "completed4w": int(m.get("completed4w") or 0),
            "z": _round(z, 2),
            "share": _round(o / sum(opens) * 100, 1) if sum(opens) else 0.0,
        })

    rows.sort(key=lambda r: r["open"], reverse=True)
    return {
        "members": rows,
        "gini": gini(opens),
        "meanOpen": _round(mean_open, 1),
        "overloaded": [r["name"] for r in rows if r["z"] >= 1.0],
        "idle": [r["name"] for r in rows if r["open"] == 0 and r["completed4w"] == 0],
    }


def project_stats(projects: list[dict], history_weeks: int) -> list[dict]:
    """Per-project velocity plus the raw inputs a simulation needs."""
    out = []
    for p in projects:
        weekly = p.get("weekly") or []
        v = velocity(weekly)
        remaining = int(p.get("open") or 0)

        # Naive deterministic estimate. The probabilistic one comes from the
        # simulation; this is here so the number is still meaningful when the
        # simulator has too little history to say anything.
        weeks_needed = None
        if v["mean"] and v["mean"] > 0 and remaining > 0:
            weeks_needed = _round(remaining / v["mean"], 1)

        deadline = _parse_date(p.get("derivedDeadline"))
        weeks_to_deadline = None
        if deadline:
            weeks_to_deadline = _round((deadline - date.today()).days / 7.0, 1)

        out.append({
            "projectId": p.get("projectId"),
            "velocity": v,
            "remaining": remaining,
            "weeksNeeded": weeks_needed,
            "weeksToDeadline": weeks_to_deadline,
            "weekly": [int(w) for w in weekly],
        })
    return out


def confidence(history_weeks: int, samples: int) -> dict[str, Any]:
    """State plainly how much the forecast can be trusted.

    With a month of history a forecast is a hint, not a promise. Saying so is
    the difference between a useful tool and a confident-sounding one.
    """
    if history_weeks < 2:
        level, note = "none", "تاریخچه‌ای برای پیش‌بینی وجود ندارد"
    elif history_weeks < 4:
        level, note = "low", f"فقط {history_weeks} هفته سابقه — پیش‌بینی بسیار تقریبی است"
    elif history_weeks < 8:
        level, note = "low", f"{history_weeks} هفته سابقه — بازه پیش‌بینی پهن است"
    elif history_weeks < 12:
        level, note = "medium", f"{history_weeks} هفته سابقه"
    else:
        level, note = "high", f"{history_weeks} هفته سابقه"
    return {"level": level, "historyWeeks": history_weeks, "samples": samples, "note": note}
