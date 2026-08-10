import math
import statistics as stat
from datetime import datetime, date, timedelta

STATUS_LABELS = {
    "TODO": "انجام‌نشده",
    "IN_PROGRESS": "در حال انجام",
    "PENDING_APPROVAL": "منتظر تایید",
    "DONE": "تکمیل شده",
}


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


def _round(v: float, digits: int = 1) -> float:
    return round(v, digits)


def _pct(part: int, total: int) -> float:
    return round((part / total) * 100, 1) if total > 0 else 0.0


def _stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    return stat.pstdev(values)


def _status_of(t: dict) -> str:
    return t.get("status") or "TODO"


def _is_done(t: dict) -> bool:
    return _status_of(t) == "DONE"


def _is_overdue(t: dict, today: date) -> bool:
    if _is_done(t):
        return False
    d = _parse_date(t.get("deadline"))
    return d is not None and d < today


def _days_overdue(t: dict, today: date) -> int:
    d = _parse_date(t.get("deadline"))
    if d is None:
        return 0
    return max(0, (today - d).days)


def _tier_label(rate: float) -> str:
    if rate >= 75:
        return "عالی"
    if rate >= 50:
        return "در حال پیشرفت"
    return "نیاز به بهبود"


def _build_rankings(payload: dict, today: date) -> dict:
    tasks: list[dict] = payload.get("tasks") or []
    projects: list[dict] = payload.get("projects") or []
    departments: list[dict] = payload.get("departments") or []
    members: list[dict] = payload.get("members") or []

    project_map = {p.get("id"): p for p in projects}
    dept_map = {d.get("id"): d for d in departments}

    # ── Departments ──
    dept_rows = []
    for dept in departments:
        did = dept.get("id")
        dept_tasks = [t for t in tasks if (project_map.get(t.get("projectId")) or {}).get("departmentId") == did]
        done = sum(1 for t in dept_tasks if _is_done(t))
        overdue = sum(1 for t in dept_tasks if _is_overdue(t, today))
        pending = sum(1 for t in dept_tasks if _status_of(t) == "PENDING_APPROVAL")
        total = len(dept_tasks)
        dept_rows.append({
            "departmentId": did,
            "name": dept.get("name") or "بدون نام",
            "managerName": dept.get("managerName") or None,
            "total": total,
            "done": done,
            "overdue": overdue,
            "pending": pending,
            "completionRate": _pct(done, total),
        })
    dept_rows = [d for d in dept_rows if d["total"] > 0 or d["name"]]
    dept_rates = [d["completionRate"] for d in dept_rows if d["total"] > 0]
    dept_mean = stat.fmean(dept_rates) if dept_rates else 0.0

    for d in dept_rows:
        dev = d["completionRate"] - dept_mean
        d["deviation"] = _round(dev, 1)
        if d["total"] == 0:
            d["reason"] = "هیچ تسکی ندارد"
        elif d["overdue"] > 0:
            d["reason"] = f"{d['overdue']} تسک دیرکرد و نرخ تکمیل {d['completionRate']}٪"
        elif d["completionRate"] >= dept_mean:
            d["reason"] = f"بالاتر از میانگین سازمان ({_round(dept_mean, 0)}٪)"
        else:
            d["reason"] = f"پایین‌تر از میانگین سازمان ({_round(dept_mean, 0)}٪)"
    dept_rows.sort(key=lambda x: (x["completionRate"], -x["total"]))

    # ── Projects ──
    proj_rows = []
    for proj in projects:
        pid = proj.get("id")
        pt = [t for t in tasks if t.get("projectId") == pid]
        done = sum(1 for t in pt if _is_done(t))
        overdue = sum(1 for t in pt if _is_overdue(t, today))
        pending = sum(1 for t in pt if _status_of(t) == "PENDING_APPROVAL")
        total = len(pt)
        rate = _pct(done, total)
        health = max(0, min(100, round(rate - (overdue * 8) - (pending * 3), 1)))
        proj_rows.append({
            "projectId": pid,
            "name": proj.get("name") or "بدون نام",
            "departmentId": proj.get("departmentId"),
            "departmentName": proj.get("departmentName") or (dept_map.get(proj.get("departmentId")) or {}).get("name") or "—",
            "total": total,
            "done": done,
            "overdue": overdue,
            "pending": pending,
            "completionRate": rate,
            "healthScore": health,
        })
    proj_rates = [p["completionRate"] for p in proj_rows if p["total"] > 0]
    proj_mean = stat.fmean(proj_rates) if proj_rates else 0.0

    for p in proj_rows:
        dev = p["completionRate"] - proj_mean
        p["deviation"] = _round(dev, 1)
        if p["total"] == 0:
            p["status"] = "warning"
            p["keyIssue"] = "هیچ تسکی ثبت نشده"
            p["reason"] = "پروژه بدون تسک است"
        elif p["overdue"] > 0:
            p["status"] = "critical"
            p["keyIssue"] = f"{p['overdue']} تسک دیرکرد"
            p["reason"] = f"دیرکرد {p['overdue']} تسک، نرخ تکمیل {p['completionRate']}٪"
        elif p["completionRate"] < 50:
            p["status"] = "critical"
            p["keyIssue"] = "پیشرفت کم"
            p["reason"] = f"نرخ تکمیل {p['completionRate']}٪ و زیر ۵۰٪"
        elif p["pending"] > 0 or p["completionRate"] < proj_mean:
            p["status"] = "warning"
            p["keyIssue"] = f"{p['pending']} تسک در انتظار تایید" if p["pending"] > 0 else "پایین‌تر از میانگین"
            p["reason"] = f"نرخ تکمیل {p['completionRate']}٪ نسبت به میانگین {_round(proj_mean, 0)}٪"
        else:
            p["status"] = "good"
            p["keyIssue"] = "در مسیر درست"
            p["reason"] = "نرخ تکمیل بالاتر از میانگین و بدون دیرکرد قابل توجه"
    proj_rows.sort(key=lambda x: (x["status"] != "good", -x["completionRate"]))

    # ── Members ──
    member_load: dict[int, dict] = {}
    for m in members:
        member_load[m.get("id")] = {
            "userId": m.get("id"),
            "name": m.get("name") or f"کاربر {m.get('id')}",
            "departmentName": m.get("departmentName") or "—",
            "total": 0,
            "done": 0,
            "overdue": 0,
            "pending": 0,
        }
    for t in tasks:
        for aid in (t.get("assigneeIds") or []):
            entry = member_load.get(aid)
            if entry is None:
                continue
            task_weight = t.get("weight") or t.get("estimatedMinutes") or 120
            entry["total"] += task_weight
            if _is_done(t):
                entry["done"] += task_weight
            if _is_overdue(t, today):
                entry["overdue"] += task_weight
            if _status_of(t) == "PENDING_APPROVAL":
                entry["pending"] += task_weight

    mem_rows = [m for m in member_load.values() if m["total"] > 0]
    for m in mem_rows:
        m["completionRate"] = _pct(m["done"], m["total"])
    mem_rates = [m["completionRate"] for m in mem_rows]
    mem_mean = stat.fmean(mem_rates) if mem_rates else 0.0
    mem_std = _stddev(mem_rates)
    overload_threshold = mem_mean + mem_std
    under_threshold = max(0.0, mem_mean - mem_std)

    for m in mem_rows:
        m["tier"] = _tier_label(m["completionRate"])
        if m["total"] > overload_threshold:
            m["loadStatus"] = "overloaded"
        elif m["total"] < under_threshold:
            m["loadStatus"] = "underloaded"
        else:
            m["loadStatus"] = "balanced"
        if m["loadStatus"] == "overloaded":
            m["reason"] = f"{m['total']} دقیقه بار کاری — بیش از میانگین تیم ({_round(mem_mean, 1)})"
        elif m["loadStatus"] == "underloaded":
            m["reason"] = f"{m['total']} دقیقه بار کاری — کمتر از میانگین تیم ({_round(mem_mean, 1)})"
        elif m["completionRate"] >= 75:
            m["reason"] = "عملکرد عالی و بار متعادل"
        elif m["overdue"] > 0:
            m["reason"] = f"{m['overdue']} دقیقه دیرکرد کاری دارد"
        else:
            m["reason"] = f"نرخ تکمیل {m['completionRate']}٪ — بار متعادل"
    mem_rows.sort(key=lambda x: (x["completionRate"], -x["total"]), reverse=True)

    return {
        "departments": dept_rows,
        "projects": proj_rows,
        "members": mem_rows,
        "averages": {
            "departmentCompletionRate": _round(dept_mean, 1),
            "projectCompletionRate": _round(proj_mean, 1),
            "memberCompletionRate": _round(mem_mean, 1),
            "memberLoadThreshold": _round(overload_threshold, 1),
        },
    }


def _build_insights(payload: dict, today: date, rankings: dict) -> dict:
    tasks: list[dict] = payload.get("tasks") or []
    total = len(tasks)
    done = sum(1 for t in tasks if _is_done(t))
    overdue = sum(1 for t in tasks if _is_overdue(t, today))
    pending = sum(1 for t in tasks if _status_of(t) == "PENDING_APPROVAL")
    completion = _pct(done, total)

    dept_rows = rankings["departments"]
    proj_rows = rankings["projects"]
    mem_rows = rankings["members"]
    avg = rankings["averages"]

    findings: list[dict] = []
    risks: list[dict] = []
    recommendations: list[dict] = []

    # ── Completion overview ──
    if total > 0:
        if completion >= 75:
            findings.append({"severity": "good", "title": "پیشرفت کلی خوب", "text": f"نرخ تکمیل کل سازمان {completion}٪ است و سازمان در مسیر مطلوبی قرار دارد."})
        elif completion >= 50:
            findings.append({"severity": "warning", "title": "پیشرفت متوسط", "text": f"نرخ تکمیل کل {completion}٪ است؛ برای رسیدن به ۷۵٪ به تمرکز بیشتری نیاز است."})
        else:
            findings.append({"severity": "critical", "title": "پیشرفت پایین", "text": f"نرخ تکمیل کل فقط {completion}٪ است و اکثر تسک‌ها باز مانده‌اند."})

    # ── Overdue ──
    if overdue > 0:
        overdue_pct = _pct(overdue, total)
        risk_text = f"{overdue} تسک ({overdue_pct}٪) از مهلت خود گذشته‌اند."
        if overdue_pct >= 20:
            risks.append({"severity": "critical", "title": "انباشت دیرکرد", "text": risk_text + " این وضعیت می‌تواند به تاخیر پروژه‌ها منجر شود."})
        else:
            risks.append({"severity": "warning", "title": "دیرکرد وجود دارد", "text": risk_text + " بهتر است هرچه سریع‌تر پیگیری شود."})
        worst_dept = max((d for d in dept_rows if d["overdue"] > 0), key=lambda d: d["overdue"], default=None)
        if worst_dept:
            risks.append({"severity": "warning", "title": f"دیرکرد در «{worst_dept['name']}»", "text": f"بیشترین دیرکرد سازمان مربوط به این دپارتمان با {worst_dept['overdue']} تسک است."})
        rec = "برای تسک‌های دیرکرد، برنامه پیگیری هفتگی مشخص کنید؛ ابتدا دیرکردهای بحرانی را اولویت‌بندی و دوباره زمان‌بندی کنید."
        recommendations.append({"title": "مدیریت دیرکرد", "text": rec})
    else:
        findings.append({"severity": "good", "title": "بدون دیرکرد", "text": "هیچ تسکی از مهلت خود نگذشته است. عالی است!"})

    # ── Pending approvals ──
    if pending > 0:
        risks.append({"severity": "warning", "title": "تسک‌های بلاتکلیف", "text": f"{pending} تسک منتظر تایید هستند که باید هرچه سریع‌تر بررسی شوند."})
        recommendations.append({"title": "رفع بلاتکلیفی", "text": f"{pending} تسک در انتظار تایید است؛ با تایید یا بازگشت آن‌ها، چرخه کار را باز کنید."})

    # ── Workload ──
    overloaded = [m for m in mem_rows if m["loadStatus"] == "overloaded"]
    underloaded = [m for m in mem_rows if m["loadStatus"] == "underloaded"]
    if overloaded:
        names = "، ".join(m["name"] for m in overloaded[:3])
        risks.append({"severity": "critical", "title": "تمرکز بار کاری", "text": f"{names} بیش از حد مشغول هستند و ریسک فرسودگی و تاخیر وجود دارد."})
        recommendations.append({"title": "توزیع بار کاری", "text": f"برخی تسک‌های {', '.join(m['name'] for m in overloaded[:3])} را به اعضای کم‌کارتر منتقل کنید."})
    if underloaded:
        findings.append({"severity": "warning", "title": "ظرفیت بلااستفاده", "text": f"{', '.join(m['name'] for m in underloaded[:3])} ظرفیت خالی دارند و می‌توانند بار بیشتری بپذیرند."})

    # ── Top / bottom performers ──
    if dept_rows:
        best = dept_rows[-1]
        worst = dept_rows[0]
        if best.get("total", 0) > 0:
            findings.append({"severity": "good", "title": f"دپارتمان برتر «{best['name']}»", "text": best["reason"]})
        if worst.get("total", 0) > 0 and worst["completionRate"] < 50:
            risks.append({"severity": "warning", "title": f"دپارتمان ضعیف «{worst['name']}»", "text": worst["reason"]})
    if proj_rows:
        critical = [p for p in proj_rows if p["status"] == "critical" and p["total"] > 0]
        if critical:
            risks.append({"severity": "critical", "title": "پروژه‌های در خطر", "text": "، ".join(p["name"] for p in critical[:3]) + " در وضعیت بحرانی هستند و نیاز به مداخله فوری دارند."})
        good = [p for p in proj_rows if p["status"] == "good" and p["total"] > 0]
        if good:
            findings.append({"severity": "good", "title": "پروژه‌های موفق", "text": "، ".join(p["name"] for p in good[:3]) + " در مسیر درست قرار دارند."})

    # ── Description quality ──
    with_desc = sum(1 for t in tasks if t.get("description") and len(t.get("description") or "") > 10)
    no_desc = total - with_desc
    if total > 0 and no_desc / total >= 0.5:
        risks.append({"severity": "warning", "title": "کیفیت پایین توضیحات", "text": f"{no_desc} تسک ({_pct(no_desc, total)}٪) توضیح کافی ندارند که درک و اجرا را دشوار می‌کند."})
        recommendations.append({"title": "تکمیل توضیحات", "text": "برای تسک‌های بدون توضیح، شرح وظایف و خروجی مورد انتظار را مشخص کنید."})

    # ── Prediction hint ──
    recommendations.append({"title": "تداوم روند", "text": "با ادامه روند فعلی، پیش‌بینی تکمیل در بخش پیش‌بینی قابل مشاهده است؛ روی پروژه‌های بحرانی تمرکز کنید."})

    if not findings:
        findings.append({"severity": "good", "title": "داده‌ای نیست", "text": "هنوز تسکی ثبت نشده است."})
    if not risks:
        risks.append({"severity": "good", "title": "بدون ریسک", "text": "ریسک مهمی شناسایی نشد."})
    if not recommendations:
        recommendations.append({"title": "شروع کار", "text": "با تعریف پروژه و تسک‌های اولیه، تحلیل آغاز می‌شود."})

    return {"findings": findings, "risks": risks, "recommendations": recommendations}


def _build_prediction(payload: dict, today: date) -> dict:
    tasks: list[dict] = payload.get("tasks") or []
    start = today - timedelta(days=90)
    weeks: list[dict] = []
    cursor = start
    while cursor <= today:
        weeks.append({"week": cursor.isoformat(), "created": 0, "done": 0})
        cursor += timedelta(days=7)

    for t in tasks:
        created = _parse_date(t.get("createdAt"))
        if created and start <= created <= today:
            idx = (created - start).days // 7
            if 0 <= idx < len(weeks):
                weeks[idx]["created"] += 1
        done_date = _parse_date(t.get("updatedAt") or t.get("approvedAt"))
        if done_date and start <= done_date <= today:
            idx = (done_date - start).days // 7
            if 0 <= idx < len(weeks):
                weeks[idx]["done"] += 1

    # Simple linear regression over last non-empty done counts
    done_series = [w["done"] for w in weeks]
    n = len(done_series)
    xs = list(range(n))
    x_mean = stat.fmean(xs)
    y_mean = stat.fmean(done_series) if n else 0.0
    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, done_series))
    den = sum((x - x_mean) ** 2 for x in xs)
    slope = num / den if den > 0 else 0.0
    intercept = y_mean - slope * x_mean

    total_done = sum(1 for t in tasks if _is_done(t))
    total_open = sum(1 for t in tasks if not _is_done(t))

    next_weeks = []
    last_done = done_series[-1] if done_series else 0
    for i in range(1, 3):
        projected = max(0, round(intercept + slope * (n - 1 + i)))
        if total_done == 0 and slope <= 0:
            projected = 0
        next_weeks.append({"week": (today + timedelta(days=7 * i)).isoformat(), "projectedDone": projected})

    if total_done == 0:
        text = "هنوز تسکی تکمیل نشده؛ با شروع کارها پیش‌بینی معنادار می‌شود."
    elif slope > 0:
        text = f"روند تکمیل هفتگی رو به رشد است؛ پیش‌بینی می‌شود حدود {sum(w['projectedDone'] for w in next_weeks)} تسک در دو هفته آینده تکمیل شود."
    elif slope < 0:
        text = f"روند تکمیل هفتگی کاهنده است؛ با {total_open} تسک باز، ریسک عقب‌ماندگی افزایش می‌یابد."
    else:
        text = f"روند تکمیل تقریباً ثابت است؛ با نرخ فعلی حدود {sum(w['projectedDone'] for w in next_weeks)} تسک در دو هفته آینده تکمیل می‌شود."

    # Advanced sprint success probability & date predictions using weights
    remaining_weight = sum(t.get("weight") or t.get("estimatedMinutes") or 120 for t in tasks if not _is_done(t))
    completed_weight_30d = 0
    cutoff = today - timedelta(days=30)
    for t in tasks:
        if _is_done(t):
            done_date = _parse_date(t.get("updatedAt") or t.get("approvedAt"))
            if done_date and done_date >= cutoff:
                completed_weight_30d += t.get("weight") or t.get("estimatedMinutes") or 120

    daily_velocity = completed_weight_30d / 30.0
    if daily_velocity <= 0.0:
        daily_velocity = 120.0  # default fallback daily velocity in minutes
        
    days_to_complete = math.ceil(remaining_weight / daily_velocity) if remaining_weight > 0 else 0
    est_completion_date = (today + timedelta(days=days_to_complete)).isoformat()
    
    # Calculate Sprint Success Probability
    at_risk_weight = 0
    for t in tasks:
        if not _is_done(t):
            w = t.get("weight") or t.get("estimatedMinutes") or 120
            dl = _parse_date(t.get("deadline"))
            if dl:
                days_left = (dl - today).days
                if days_left < (w / daily_velocity):
                    at_risk_weight += w
                
    success_prob = 100
    if remaining_weight > 0:
        success_prob = max(10, min(100, round((1.0 - (at_risk_weight / remaining_weight)) * 100)))
        
    recommended_throughput = _round(remaining_weight / 14.0, 1)

    return {
        "weeks": weeks,
        "forecast": next_weeks,
        "totalDone": total_done,
        "totalOpen": total_open,
        "text": text,
        "sprintSuccessProbability": success_prob,
        "estimatedProjectCompletionDate": est_completion_date,
        "recommendedDailyThroughput": recommended_throughput,
        "remainingWeight": remaining_weight,
    }


def analyze_insights(payload: dict) -> dict:
    today = date.today()
    tasks: list[dict] = payload.get("tasks") or []

    total = len(tasks)
    done = sum(1 for t in tasks if _is_done(t))
    overdue = sum(1 for t in tasks if _is_overdue(t, today))
    pending = sum(1 for t in tasks if _status_of(t) == "PENDING_APPROVAL")

    rankings = _build_rankings(payload, today)
    insights = _build_insights(payload, today, rankings)
    prediction = _build_prediction(payload, today)

    return {
        "counts": {
            "total": total,
            "done": done,
            "overdue": overdue,
            "pending": pending,
            "completionRate": _pct(done, total),
        },
        "rankings": rankings,
        "insights": insights,
        "prediction": prediction,
        "computedBy": "python",
    }
