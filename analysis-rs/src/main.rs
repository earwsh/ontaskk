use axum::{routing::post, Json, Router};
use chrono::{DateTime, Local, NaiveDate};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;

#[derive(Deserialize, Clone)]
struct TaskItem {
    status: Option<String>,
    deadline: Option<String>,
    assignee_ids: Option<Vec<i64>>,
}

#[derive(Deserialize)]
struct TasksPayload {
    tasks: Vec<TaskItem>,
}

#[derive(Deserialize)]
struct MemberItem {
    id: i64,
    total: Option<i64>,
    done: Option<i64>,
    overdue: Option<i64>,
    name: Option<String>,
    #[serde(rename = "departmentName")]
    department_name: Option<String>,
}

#[derive(Deserialize)]
struct MembersPayload {
    members: Vec<MemberItem>,
}

#[derive(Deserialize)]
struct ProjectItem {
    id: Option<i64>,
    name: Option<String>,
    tasks: Vec<TaskItem>,
}

#[derive(Deserialize)]
struct ProjectsPayload {
    projects: Vec<ProjectItem>,
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.date_naive())
        .ok()
        .or_else(|| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
}

fn is_overdue(status: &str, deadline: &Option<String>) -> bool {
    if status == "DONE" {
        return false;
    }
    match deadline {
        Some(d) if !d.is_empty() => {
            let today = Local::now().date_naive();
            parse_date(d).map(|dd| dd < today).unwrap_or(false)
        }
        _ => false,
    }
}

fn completion_rate(done: i64, total: i64) -> f64 {
    if total == 0 {
        0.0
    } else {
        (done as f64 / total as f64) * 100.0
    }
}

fn classify_project(rate: f64, overdue: i64, pending: i64, total: i64) -> (String, String) {
    if total == 0 {
        return ("warning".into(), "پروژه بدون تسک است".into());
    }
    if overdue > 0 {
        return ("critical".into(), format!("{} تسک دیرکرد دارد", overdue));
    }
    if rate < 50.0 {
        return ("critical".into(), "نرخ تکمیل کمتر از ۵۰٪ است".into());
    }
    if pending > 0 {
        return (
            "warning".into(),
            format!("{} تسک در انتظار تایید است", pending),
        );
    }
    ("good".into(), "در مسیر درست قرار دارد".into())
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

async fn aggregate_tasks(Json(payload): Json<TasksPayload>) -> Json<Value> {
    let total = payload.tasks.len() as i64;
    let mut status_counts: HashMap<String, i64> = HashMap::new();
    let mut done = 0;
    let mut overdue = 0;

    for t in &payload.tasks {
        let status = t.status.clone().unwrap_or_default();
        *status_counts.entry(status.clone()).or_insert(0) += 1;
        if status == "DONE" {
            done += 1;
        }
        if is_overdue(&status, &t.deadline) {
            overdue += 1;
        }
    }

    Json(json!({
        "total": total,
        "done": done,
        "overdue": overdue,
        "completionRate": completion_rate(done, total),
        "statusCounts": status_counts,
        "computedBy": "rust",
    }))
}

async fn aggregate_members(Json(payload): Json<TasksPayload>) -> Json<Value> {
    let mut members: HashMap<i64, (i64, i64, i64)> = HashMap::new();

    for t in &payload.tasks {
        let status = t.status.clone().unwrap_or_default();
        if let Some(ids) = &t.assignee_ids {
            for id in ids {
                let entry = members.entry(*id).or_insert((0, 0, 0));
                entry.0 += 1;
                if status == "DONE" {
                    entry.1 += 1;
                }
                if is_overdue(&status, &t.deadline) {
                    entry.2 += 1;
                }
            }
        }
    }

    let mut result: Vec<Value> = members
        .iter()
        .map(|(id, (total, done, overdue))| {
            json!({
                "userId": id,
                "total": total,
                "done": done,
                "overdue": overdue,
                "completionRate": completion_rate(*done, *total),
            })
        })
        .collect();

    result.sort_by(|a, b| {
        let ra = a["completionRate"].as_f64().unwrap_or(0.0);
        let rb = b["completionRate"].as_f64().unwrap_or(0.0);
        rb.partial_cmp(&ra).unwrap_or(std::cmp::Ordering::Equal)
    });

    Json(json!({ "members": result, "computedBy": "rust" }))
}

async fn aggregate_projects(Json(payload): Json<ProjectsPayload>) -> Json<Value> {
    let mut rates: Vec<f64> = Vec::new();
    let mut breakdown: Vec<Value> = Vec::new();

    for p in &payload.projects {
        let total = p.tasks.len() as i64;
        let done = p
            .tasks
            .iter()
            .filter(|t| t.status.as_deref() == Some("DONE"))
            .count() as i64;
        let overdue = p
            .tasks
            .iter()
            .filter(|t| is_overdue(&t.status.clone().unwrap_or_default(), &t.deadline))
            .count() as i64;
        let pending = p
            .tasks
            .iter()
            .filter(|t| t.status.as_deref() == Some("PENDING_APPROVAL"))
            .count() as i64;
        let rate = completion_rate(done, total);
        rates.push(rate);
        let (risk, reason) = classify_project(rate, overdue, pending, total);
        breakdown.push(json!({
            "projectId": p.id,
            "projectName": p.name,
            "total": total,
            "done": done,
            "overdue": overdue,
            "pending": pending,
            "completionRate": rate,
            "risk": risk,
            "reason": reason,
        }));
    }

    let mean: f64 = if rates.is_empty() {
        0.0
    } else {
        rates.iter().sum::<f64>() / rates.len() as f64
    };

    for item in breakdown.iter_mut() {
        let rate = item["completionRate"].as_f64().unwrap_or(0.0);
        item["deviationFromMean"] = ((rate - mean).round() as i64).into();
    }

    Json(json!({ "projects": breakdown, "meanCompletionRate": round2(mean), "computedBy": "rust" }))
}

async fn aggregate_health(Json(payload): Json<MembersPayload>) -> Json<Value> {
    let totals: Vec<i64> = payload.members.iter().map(|m| m.total.unwrap_or(0)).collect();
    let n = totals.len() as f64;
    let mean: f64 = if n == 0.0 {
        0.0
    } else {
        totals.iter().sum::<i64>() as f64 / n
    };

    let variance: f64 = if n <= 1.0 {
        0.0
    } else {
        totals.iter().map(|v| (v - mean as i64) as f64).map(|x| x * x).sum::<f64>() / n
    };
    let stddev = variance.sqrt();

    let gini: f64 = if n == 0.0 {
        0.0
    } else {
        let mut sorted = totals.clone();
        sorted.sort();
        let mut cumulative = 0.0;
        let mut lorenz_sum = 0.0;
        for v in &sorted {
            cumulative += *v as f64;
            lorenz_sum += cumulative;
        }
        let sum = totals.iter().sum::<i64>() as f64;
        if sum == 0.0 {
            0.0
        } else {
            1.0 - (2.0 * lorenz_sum) / (n * sum) + 1.0 / n
        }
    };

    let overload_threshold = mean + stddev;
    let under_threshold = (mean - stddev).max(0.0);

    let overloaded: Vec<Value> = payload
        .members
        .iter()
        .filter(|m| m.total.unwrap_or(0) as f64 > overload_threshold)
        .map(|m| {
            json!({
                "userId": m.id,
                "name": m.name,
                "departmentName": m.department_name,
                "total": m.total,
                "done": m.done,
                "overdue": m.overdue,
                "completionRate": completion_rate(m.done.unwrap_or(0), m.total.unwrap_or(0)),
                "loadStatus": "overloaded",
                "reason": format!("{} دقیقه بار کاری — بیش از میانگین تیم ({:.1})", m.total.unwrap_or(0), mean),
            })
        })
        .collect();

    let underloaded: Vec<Value> = payload
        .members
        .iter()
        .filter(|m| (m.total.unwrap_or(0) as f64) < under_threshold)
        .map(|m| {
            json!({
                "userId": m.id,
                "name": m.name,
                "departmentName": m.department_name,
                "total": m.total,
                "done": m.done,
                "overdue": m.overdue,
                "completionRate": completion_rate(m.done.unwrap_or(0), m.total.unwrap_or(0)),
                "loadStatus": "underloaded",
                "reason": format!("{} دقیقه بار کاری — کمتر از میانگین تیم ({:.1})", m.total.unwrap_or(0), mean),
            })
        })
        .collect();

    let balance = if gini < 0.2 {
        "بار کاری تیم به نسبت متعادل است"
    } else if gini < 0.4 {
        "عدم تعادل متوسطی در توزیع بار کاری دیده می‌شود"
    } else {
        "نابرابری بالایی در توزیع بار کاری تیم وجود دارد"
    };

    let narrative = if overloaded.is_empty() {
        format!("{}؛ هیچ عضوی بیش از ظرفیت در حال کار نیست.", balance)
    } else {
        format!(
            "{}؛ {} نفر بیش از ظرفیت در حال کار هستند و نیاز به بازتوزیع بار دارند.",
            balance,
            overloaded.len()
        )
    };

    Json(json!({
        "memberCount": payload.members.len(),
        "meanLoad": round2(mean),
        "stddev": round2(stddev),
        "giniCoefficient": round2(gini),
        "overloadThreshold": round2(overload_threshold),
        "overloaded": overloaded,
        "underloaded": underloaded,
        "narrative": narrative,
        "computedBy": "rust",
    }))
}

#[derive(Deserialize)]
struct ScrumTaskItem {
    id: i64,
    status: String,
    created_at: String,
    start_date: Option<String>,
    approved_at: Option<String>,
    updated_at: Option<String>,
    weight: Option<i64>,
    estimated_minutes: Option<i64>,
    assignee_ids: Vec<i64>,
}

#[derive(Deserialize)]
struct ScrumUserItem {
    id: i64,
    name: String,
    role: String,
}

#[derive(Deserialize)]
struct ScrumPayload {
    tasks: Vec<ScrumTaskItem>,
    users: Vec<ScrumUserItem>,
}

async fn aggregate_scrum(Json(payload): Json<ScrumPayload>) -> Json<Value> {
    let tasks = payload.tasks;
    let users = payload.users;
    let now = chrono::Utc::now();

    // 1. Capacity Allocation
    let mut capacity_data = Vec::new();
    for user in &users {
        let active_tasks: Vec<&ScrumTaskItem> = tasks
            .iter()
            .filter(|t| t.status != "DONE" && t.assignee_ids.contains(&user.id))
            .collect();
        
        let total_weight: i64 = active_tasks
            .iter()
            .map(|t| t.weight.or(t.estimated_minutes).unwrap_or(0))
            .sum();

        let weekly_capacity = 2400;
        let utilization = if weekly_capacity > 0 {
            ((total_weight as f64 / weekly_capacity as f64) * 100.0).round() as i64
        } else {
            0
        };

        capacity_data.push(json!({
            "userId": user.id,
            "name": user.name,
            "role": user.role,
            "activeTasksCount": active_tasks.len(),
            "allocatedWeight": total_weight,
            "capacity": weekly_capacity,
            "utilization": utilization,
            "isOverloaded": total_weight > weekly_capacity,
        }));
    }

    // Sort by utilization descending
    capacity_data.sort_by(|a, b| {
        let ua = a["utilization"].as_i64().unwrap_or(0);
        let ub = b["utilization"].as_i64().unwrap_or(0);
        ub.cmp(&ua)
    });

    // 2. Velocity
    let mut velocity_data = Vec::new();
    for i in (0..=3).rev() {
        let start = now - chrono::Duration::days(i * 7 + 7);
        let end = now - chrono::Duration::days(i * 7);

        let done_tasks: Vec<&ScrumTaskItem> = tasks
            .iter()
            .filter(|t| {
                if t.status != "DONE" {
                    return false;
                }
                let date_str = t.approved_at.as_ref().or(t.updated_at.as_ref()).unwrap_or(&t.created_at);
                if let Ok(dt) = DateTime::parse_from_rfc3339(date_str) {
                    let utc_dt = dt.with_timezone(&chrono::Utc);
                    return utc_dt >= start && utc_dt <= end;
                }
                false
            })
            .collect();

        let weight_sum: i64 = done_tasks
            .iter()
            .map(|t| t.weight.or(t.estimated_minutes).unwrap_or(0))
            .sum();

        let label = if i == 0 {
            "هفته جاری".to_string()
        } else {
            format!("{} هفته قبل", i)
        };

        velocity_data.push(json!({
            "weekLabel": label,
            "completedTasksCount": done_tasks.len(),
            "completedWeight": weight_sum,
        }));
    }

    // 3. Lead & Cycle time
    let completed_tasks: Vec<&ScrumTaskItem> = tasks.iter().filter(|t| t.status == "DONE").collect();
    let mut total_lead_days = 0.0;
    let mut total_cycle_days = 0.0;
    let mut lead_count = 0;
    let mut cycle_count = 0;

    for t in &completed_tasks {
        let created = DateTime::parse_from_rfc3339(&t.created_at)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or(now);
        let completed = DateTime::parse_from_rfc3339(
            t.approved_at.as_ref().or(t.updated_at.as_ref()).unwrap_or(&t.created_at)
        )
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or(now);

        if let Some(ref start_str) = t.start_date {
            if let Ok(start_dt) = DateTime::parse_from_rfc3339(start_str) {
                let start = start_dt.with_timezone(&chrono::Utc);
                let lead_diff = (start - created).num_seconds() as f64 / 86400.0;
                let cycle_diff = (completed - start).num_seconds() as f64 / 86400.0;
                
                total_lead_days += lead_diff.max(0.0);
                total_cycle_days += cycle_diff.max(0.0);
                lead_count += 1;
                cycle_count += 1;
                continue;
            }
        }
        let diff = (completed - created).num_seconds() as f64 / 86400.0;
        total_cycle_days += diff.max(0.0);
        cycle_count += 1;
    }

    let avg_lead = if lead_count > 0 { total_lead_days / lead_count as f64 } else { 1.2 };
    let avg_cycle = if cycle_count > 0 { total_cycle_days / cycle_count as f64 } else { 2.5 };

    // 4. Bottlenecks
    let mut bottlenecks = Vec::new();
    for cap in &capacity_data {
        let active_count = cap["activeTasksCount"].as_i64().unwrap_or(0);
        if active_count > 0 {
            let util = cap["utilization"].as_i64().unwrap_or(0);
            let severity = if util > 100 {
                "HIGH"
            } else if util > 70 {
                "MEDIUM"
            } else {
                "LOW"
            };
            bottlenecks.push(json!({
                "name": cap["name"],
                "activeTasks": active_count,
                "allocatedWeight": cap["allocatedWeight"],
                "utilization": util,
                "severity": severity,
            }));
        }
    }
    bottlenecks.sort_by(|a, b| {
        let wa = a["allocatedWeight"].as_i64().unwrap_or(0);
        let wb = b["allocatedWeight"].as_i64().unwrap_or(0);
        wb.cmp(&wa)
    });
    bottlenecks.truncate(5);

    // 5. Burndown
    let total_sprint_weight: i64 = tasks.iter().map(|t| t.weight.or(t.estimated_minutes).unwrap_or(120)).sum();
    let mut burndown_data = Vec::new();
    
    // Sort completed tasks chronologically
    let mut completed_tasks_sorted = completed_tasks.clone();
    completed_tasks_sorted.sort_by(|a, b| {
        let da = a.approved_at.as_ref().or(a.updated_at.as_ref()).unwrap_or(&a.created_at);
        let db = b.approved_at.as_ref().or(b.updated_at.as_ref()).unwrap_or(&b.created_at);
        da.cmp(db)
    });

    for day in 1..=10 {
        let ideal = (total_sprint_weight as f64 * (1.0 - day as f64 / 10.0)).round() as i64;
        let fraction_idx = (completed_tasks_sorted.len() * day) / 10;
        let completed_weight_day: i64 = completed_tasks_sorted[0..fraction_idx]
            .iter()
            .map(|t| t.weight.or(t.estimated_minutes).unwrap_or(120))
            .sum();
        let actual = (total_sprint_weight - completed_weight_day).max(0);
        burndown_data.push(json!({
            "dayLabel": format!("روز {}", day),
            "ideal": ideal,
            "actual": actual,
        }));
    }

    Json(json!({
        "capacity": capacity_data,
        "velocity": velocity_data,
        "metrics": {
            "avgLeadTimeDays": (avg_lead * 10.0).round() / 10.0,
            "avgCycleTimeDays": (avg_cycle * 10.0).round() / 10.0,
            "completedCount": completed_tasks.len(),
            "pendingApprovalCount": tasks.iter().filter(|t| t.status == "PENDING_APPROVAL").count(),
            "activeCount": tasks.iter().filter(|t| t.status == "IN_PROGRESS" || t.status == "TODO").count(),
        },
        "bottlenecks": bottlenecks,
        "burndown": burndown_data,
        "computedBy": "rust",
    }))
}

#[derive(Deserialize)]
struct GanttTaskItem {
    id: i64,
    title: String,
    status: String,
    start_date: Option<String>,
    deadline: Option<String>,
    created_at: String,
    weight: Option<i64>,
    estimated_minutes: Option<i64>,
    assignee_ids: Vec<i64>,
}

#[derive(Deserialize)]
struct GanttUserItem {
    id: i64,
    name: String,
}

#[derive(Deserialize)]
struct GanttPayload {
    tasks: Vec<GanttTaskItem>,
    users: Vec<GanttUserItem>,
}

async fn aggregate_gantt(Json(payload): Json<GanttPayload>) -> Json<Value> {
    let tasks = payload.tasks;
    let users = payload.users;

    // 1. Calculate daily load for each user
    // We'll track user_id -> Map<date_string, (total_weight, task_ids)>
    let mut daily_user_loads: HashMap<i64, HashMap<String, (i64, Vec<i64>)>> = HashMap::new();

    for task in &tasks {
        if task.status == "DONE" {
            continue;
        }

        let weight = task.weight.or(task.estimated_minutes).unwrap_or(120);
        
        let start_date = task.start_date.as_ref()
            .and_then(|s| parse_date(s))
            .unwrap_or_else(|| {
                parse_date(&task.created_at).unwrap_or_else(|| Local::now().date_naive())
            });

        let end_date = task.deadline.as_ref()
            .and_then(|s| parse_date(s))
            .unwrap_or_else(|| start_date.clone() + chrono::Duration::days(3));

        let end_date = if end_date < start_date { start_date.clone() } else { end_date };

        let duration_days = (end_date - start_date).num_days() + 1;
        let daily_weight = if duration_days > 0 { weight / duration_days } else { weight };

        for assignee_id in &task.assignee_ids {
            let user_load = daily_user_loads.entry(*assignee_id).or_insert_with(HashMap::new);
            
            let mut curr = start_date.clone();
            while curr <= end_date {
                let date_str = curr.format("%Y-%m-%d").to_string();
                let entry = user_load.entry(date_str).or_insert((0, Vec::new()));
                entry.0 += daily_weight;
                if !entry.1.contains(&task.id) {
                    entry.1.push(task.id);
                }
                curr = curr + chrono::Duration::days(1);
            }
        }
    }

    // 2. Find clashes where daily load > 480
    let mut clashes = Vec::new();
    let mut clashing_task_ids = std::collections::HashSet::new();

    for user in &users {
        if let Some(user_load) = daily_user_loads.get(&user.id) {
            for (date_str, (weight, task_ids)) in user_load {
                if *weight > 480 && task_ids.len() > 1 {
                    clashes.push(json!({
                        "userId": user.id,
                        "userName": user.name,
                        "date": date_str,
                        "totalWeight": weight,
                        "taskIds": task_ids,
                        "message": format!(
                            "تداخل کاری در تاریخ {} برای {}: مجموع بار کاری {} دقیقه است (بیش از ظرفیت ۴۸۰ دقیقه در روز).",
                            date_str, user.name, weight
                        )
                    }));
                    for tid in task_ids {
                        clashing_task_ids.insert(*tid);
                    }
                }
            }
        }
    }

    // 3. Attach clash flag to tasks
    let tasks_with_clash_flags: Vec<Value> = tasks.iter().map(|t| {
        let has_clash = clashing_task_ids.contains(&t.id);
        json!({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "startDate": t.start_date,
            "deadline": t.deadline,
            "weight": t.weight,
            "estimatedMinutes": t.estimated_minutes,
            "hasClash": has_clash,
        })
    }).collect();

    Json(json!({
        "tasks": tasks_with_clash_flags,
        "clashes": clashes,
        "computedBy": "rust"
    }))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "analysis-rs", "computedBy": "rust" }))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", axum::routing::get(health))
        .route("/aggregate/tasks", post(aggregate_tasks))
        .route("/aggregate/members", post(aggregate_members))
        .route("/aggregate/projects", post(aggregate_projects))
        .route("/aggregate/health", post(aggregate_health))
        .route("/aggregate/scrum", post(aggregate_scrum))
        .route("/aggregate/gantt", post(aggregate_gantt));

    let addr = SocketAddr::from(([0, 0, 0, 0], 5200));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("analysis-rs listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
