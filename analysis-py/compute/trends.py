import math
from datetime import datetime, date, timedelta


def _parse_date(value) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except Exception:
        try:
            return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
        except Exception:
            return None


def _days_to_done(task) -> float | None:
    created = _parse_date(task.get("createdAt"))
    done = _parse_date(task.get("updatedAt") or task.get("approvedAt"))
    if not created or not done:
        return None
    return (done - created).days


def _trend_by_week(tasks: list[dict], field: str, start: date, end: date) -> list[dict]:
    buckets: list[dict] = []
    cursor = start
    while cursor <= end:
        buckets.append({"week": cursor.isoformat(), "count": 0})
        cursor += timedelta(days=7)
    for t in tasks:
        d = _parse_date(t.get(field))
        if not d or d < start or d > end:
            continue
        idx = (d - start).days // 7
        if 0 <= idx < len(buckets):
            buckets[idx]["count"] += 1
    return buckets


def _pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx == 0 or dy == 0:
        return 0.0
    return round(num / (dx * dy), 3)


def analyze_trends(payload: dict) -> dict:
    tasks = payload.get("tasks") or []
    projects = payload.get("projects") or []

    today = date.today()
    start = today - timedelta(days=90)

    created_trend = _trend_by_week(tasks, "createdAt", start, today)
    done_trend = _trend_by_week(tasks, "updatedAt", start, today)

    corr_hours = []
    corr_days = []
    for t in tasks:
        if t.get("status") == "DONE" and t.get("estimatedHours") is not None:
            days = _days_to_done(t)
            if days is not None:
                corr_hours.append(float(t["estimatedHours"]))
                corr_days.append(float(days))

    project_health = []
    for p in projects:
        pt = [t for t in tasks if t.get("projectId") == p.get("id")]
        if not pt:
            continue
        done = sum(1 for t in pt if t.get("status") == "DONE")
        overdue = sum(1 for t in pt if t.get("status") != "DONE" and _parse_date(t.get("deadline")) and _parse_date(t.get("deadline")) < today)
        pending = sum(1 for t in pt if t.get("status") == "PENDING_APPROVAL")
        completion = round((done / len(pt)) * 100, 1) if pt else 0
        health = max(0, round(100 - (overdue * 8) - (pending * 4) - ((100 - completion) * 0.3), 1))
        project_health.append({
            "projectId": p.get("id"),
            "projectName": p.get("name") or "بدون نام",
            "total": len(pt),
            "done": done,
            "overdue": overdue,
            "pendingApproval": pending,
            "completionRate": completion,
            "healthScore": min(100, health),
        })
    project_health.sort(key=lambda x: x["healthScore"])

    return {
        "range": {"start": start.isoformat(), "end": today.isoformat()},
        "createdTrend": created_trend,
        "doneTrend": done_trend,
        "hoursVsDaysCorrelation": _pearson(corr_hours, corr_days),
        "correlationPairs": len(corr_hours),
        "projectHealth": project_health,
        "computedBy": "python",
    }
