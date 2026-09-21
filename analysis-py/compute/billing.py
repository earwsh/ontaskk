import re
from typing import Any

# Deliverable categories with targeted keywords, display title, default invoice description, and default unit
DELIVERABLE_RULES = [
    {
        "key": "seo_articles",
        "title": "تألیف مقالات سئو",
        "default_description": "تألیف، نگارش و بهینه‌سازی مقالات تخصصی سئو و انتشار در وب‌سایت",
        "unit": "مقاله",
        "unit_mode": "count", # or 'hours'
        "keywords": ["تألیف", "تالیف", "مقاله", "محتوا", "بلاگ", "پست وبلاگ", "article", "blog", "content"],
    },
    {
        "key": "reels",
        "title": "تولید و تدوین ریلز",
        "default_description": "سناریونویسی، تولید، ضبط و تدوین ویدیوهای ریلز اینستاگرام",
        "unit": "ویدیو",
        "unit_mode": "count",
        "keywords": ["ریلز", "reels", "ریل", "ویدیو ریلز", "ویدئو ریلز", "کلیپ اینستاگرام"],
    },
    {
        "key": "stories",
        "title": "طراحی و انتشار استوری",
        "default_description": "طراحی گرافیکی، سناریونویسی تعاملی و انتشار استوری‌های اینستاگرام",
        "unit": "استوری",
        "unit_mode": "count",
        "keywords": ["استوری", "story", "stories", "استوری‌ها"],
    },
    {
        "key": "graphic_design",
        "title": "طراحی گرافیک و پست",
        "default_description": "طراحی گرافیکی کاور، پست‌های اسلایدی و بنرهای تبلیغاتی",
        "unit": "طرح",
        "unit_mode": "count",
        "keywords": ["طراحی پست", "کاور", "بنر", "اسلایدی", "پوستر", "گرافیک", "فتوشاپ", "banner", "poster"],
    },
    {
        "key": "seo_technical",
        "title": "سئو تکنیکال و آپدیت وب‌سایت",
        "default_description": "بهینه‌سازی فنی، بررسی سرچ کنسول، رفع خطاهای تکنیکال و بازنویسی صفحات قدیمی",
        "unit": "ساعت",
        "unit_mode": "hours",
        "keywords": ["آپدیت", "بروزرسانی", "سرچ کنسول", "تکنیکال", "آنپیج", "onpage", "لینک سازی", "بک لینک", "ایندکس", "search console"],
    },
    {
        "key": "development",
        "title": "توسعه و پشتیبانی فنی",
        "default_description": "خدمات توسعه نرم‌افزار، برنامه‌نویسی، پیاده‌سازی قابلیت‌ها و رفع باگ‌ها",
        "unit": "ساعت",
        "unit_mode": "hours",
        "keywords": ["توسعه", "برنامه نویسی", "کد", "فرانت", "بک اند", "frontend", "backend", "باگ", "bug", "طراحی ui", "ui", "api"],
    },
]


def match_category(text: str) -> str:
    text_lower = text.lower()
    for rule in DELIVERABLE_RULES:
        for kw in rule["keywords"]:
            if kw.lower() in text_lower:
                return rule["key"]
    return "other"


def analyze_billing_tasks(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Groups completed tasks into billable deliverable categories with counts,
    working hours (from weight), and task references.
    """
    groups: dict[str, dict[str, Any]] = {}

    # Initialize groups
    for rule in DELIVERABLE_RULES:
        groups[rule["key"]] = {
            "key": rule["key"],
            "title": rule["title"],
            "description": rule["default_description"],
            "unit": rule["unit"],
            "unitMode": rule["unit_mode"],
            "count": 0,
            "totalMinutes": 0,
            "totalHours": 0.0,
            "tasks": [],
        }

    groups["other"] = {
        "key": "other",
        "title": "سایر خدمات و فعالیت‌ها",
        "default_description": "سایر فعالیت‌ها و خدمات اجرایی پروژه",
        "unit": "ساعت",
        "unitMode": "hours",
        "count": 0,
        "totalMinutes": 0,
        "totalHours": 0.0,
        "tasks": [],
    }

    for task in tasks:
        title = task.get("title") or ""
        desc = task.get("description") or ""
        combined_text = f"{title} {desc}"
        weight = task.get("weight") or 0

        cat_key = match_category(combined_text)
        group = groups[cat_key]

        group["count"] += 1
        group["totalMinutes"] += weight
        group["tasks"].append({
            "id": task.get("id"),
            "title": title,
            "weight": weight,
            "hours": round(weight / 60, 1) if weight else 0,
            "deadline": task.get("deadline"),
        })

    # Filter out empty groups and calculate final hours & recommended quantities
    result_groups = []
    for group in groups.values():
        if group["count"] > 0:
            group["totalHours"] = round(group["totalMinutes"] / 60, 1) if group["totalMinutes"] else round(group["count"] * 1.5, 1)
            # Quantity recommended for billing:
            if group["unitMode"] == "hours":
                group["suggestedQuantity"] = group["totalHours"] if group["totalHours"] > 0 else group["count"]
            else:
                group["suggestedQuantity"] = group["count"]
            
            result_groups.append(group)

    # Sort so most prominent deliverable groups appear first
    result_groups.sort(key=lambda g: (-g["count"], -g["totalMinutes"]))

    return {
        "totalTasksAnalyzed": len(tasks),
        "deliverables": result_groups,
        "computedBy": "python-nlp",
    }
