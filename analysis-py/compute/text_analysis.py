import re

STOP_WORDS = {
    "و", "به", "از", "در", "با", "که", "را", "این", "آن", "برای", "یک", "دو",
    "تا", "شده", "نیز", "شد", "است", "می", "های", "شود", "شوند", "کرد", "کنید",
    "دهید", "گیرد", "کردن", "گرفتن", "باید", "باشد", "اما", "اگر", "یا", "نه",
    "هیچ", "هم", "خواهد", "دادن", "داد", "دارد", "دارند", "کرده", "باشند",
    "باشه", "نخواهد", "نمی", "ممکن", "نیست", "شامل", "جهت", "منظور", "قبل",
    "بعد", "حین", "طی", "طول", "زمان", "the", "a", "an", "in", "on", "at",
    "to", "for", "of", "and", "or", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would", "can",
    "could", "may", "might", "shall", "should", "it", "its", "this", "that",
    "these", "those", "i", "you", "we", "they", "he", "she", "my", "your",
    "our", "their", "his", "her", "not", "no", "but", "if", "so", "as",
    "تسک", "task", "فقط", "مقدار", "لطفا", "لطفاً", "وجود", "شما", "نام",
    "ادرس", "آدرس", "قرار",
}

CATEGORY_KEYWORDS = {
    "باگ/اشکال": ["باگ", "اشکال", "مشکل", "خطا", "error", "bug", "خراب", "عدم", "نقص", "اشتباه", "نمایش", "غلط"],
    "قابلیت جدید": ["افزودن", "ساخت", "ایجاد", "اضافه", "جدید", "feature", "add", "create", "new", "طراحی", "ساختن", "نوشتن", "صفحه", "بخش"],
    "بهبود/اصلاح": ["اصلاح", "بهبود", "رفع", "بهینه", "بروزرسانی", "update", "تغییر", "توسعه"],
    "مستندات": ["مستند", "documentation", "راهنما", "آموزش", "doc"],
    "طراحی/UI": ["طراحی", "design", "ui", "ux", "ظاهری", "رنگ", "فونت", "چیدمان"],
    "تست/اعتبارسنجی": ["تست", "test", "آزمایش", "اعتبارسنجی", "validation"],
}

SPLIT_RE = re.compile(r"[\s،,;:.!؟?\-_()\[\]{}\"'«»\n\r\t]+")


def analyze_text(tasks: list) -> dict:
    word_counts: dict[str, int] = {}
    for task in tasks:
        text = f"{task.get('title', '')} {task.get('description') or ''}".lower()
        for word in SPLIT_RE.split(text):
            if len(word) > 1 and word not in STOP_WORDS:
                word_counts[word] = word_counts.get(word, 0) + 1

    top_words = sorted(word_counts.items(), key=lambda x: (-x[1], x[0]))[:50]
    top_words = [{"word": w, "count": c} for w, c in top_words]

    category_counts = {cat: 0 for cat in CATEGORY_KEYWORDS}
    category_counts["سایر"] = 0
    for task in tasks:
        text = f"{task.get('title', '')} {task.get('description') or ''}".lower()
        matched = False
        for cat, keywords in CATEGORY_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                category_counts[cat] += 1
                matched = True
                break
        if not matched:
            category_counts["سایر"] += 1

    category_distribution = [
        {"category": cat, "count": count}
        for cat, count in category_counts.items()
        if count > 0
    ]

    reports_by_user: dict[str, dict] = {}
    for task in tasks:
        for report in task.get("reports") or []:
            user = report.get("user") or {}
            name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip()
            if name not in reports_by_user:
                reports_by_user[name] = {"count": 0, "total_length": 0}
            reports_by_user[name]["count"] += 1
            reports_by_user[name]["total_length"] += len(report.get("content") or "")

    report_summary = [
        {"name": name, "reportCount": d["count"], "avgLength": round(d["total_length"] / d["count"])}
        for name, d in sorted(reports_by_user.items(), key=lambda x: (-x[1]["count"], x[0]))
    ]

    with_description = sum(1 for t in tasks if t.get("description") and len(t.get("description") or "") > 10)
    without_description = len(tasks) - with_description
    description_lengths = [len(t.get("description")) for t in tasks if t.get("description")]
    avg_description_length = round(sum(description_lengths) / len(description_lengths)) if description_lengths else 0

    reports_count = sum(len(t.get("reports") or []) for t in tasks)

    return {
        "tasksCount": len(tasks),
        "reportsCount": reports_count,
        "topWords": top_words,
        "categoryDistribution": category_distribution,
        "reportSummary": report_summary,
        "descriptionQuality": {
            "withDescription": with_description,
            "withoutDescription": without_description,
            "avgDescriptionLength": avg_description_length,
        },
    }
