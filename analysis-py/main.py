from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any

from compute.text_analysis import analyze_text
from compute.billing import analyze_billing_tasks
from compute.statistics import analyze_stats
from compute.trends import analyze_trends
from compute.insights import analyze_insights
from compute.delivery import (
    project_stats,
    cycle_time,
    workload,
    velocity,
    confidence,
)

app = FastAPI(title="OnTask Analysis (Python)", version="1.0.0")


class TasksPayload(BaseModel):
    tasks: list[Any] = []


class StatsPayload(BaseModel):
    series: list[Any] = []


class TrendsPayload(BaseModel):
    tasks: list[Any] = []
    projects: list[Any] = []


class InsightsPayload(BaseModel):
    tasks: list[Any] = []
    projects: list[Any] = []
    departments: list[Any] = []
    members: list[Any] = []


class DeliveryPayload(BaseModel):
    """Pre-aggregated facts from Postgres — never raw task rows."""

    projects: list[Any] = []
    orgWeekly: list[float] = []
    cycleDays: list[float] = []
    members: list[Any] = []
    historyWeeks: int = 0


@app.get("/health")
def health():
    return {"status": "ok", "service": "analysis-py", "computedBy": "python"}


@app.post("/analyze/delivery")
def delivery(payload: DeliveryPayload):
    """Statistics for the delivery view.

    Deliberately receives counts, not tasks: the aggregation belongs in the
    database, and this service's job is the part SQL is bad at.
    """
    data = payload.model_dump()
    return {
        "org": {
            "velocity": velocity(data["orgWeekly"]),
            "cycleTime": cycle_time(data["cycleDays"]),
        },
        "workload": workload(data["members"]),
        "projects": project_stats(data["projects"], data["historyWeeks"]),
        "confidence": confidence(data["historyWeeks"], len(data["cycleDays"])),
        "computedBy": "python",
    }


@app.post("/analyze/text")
def text_analysis(payload: TasksPayload):
    return analyze_text(payload.tasks)


@app.post("/analyze/stats")
def stats(payload: StatsPayload):
    return analyze_stats(payload.model_dump())


@app.post("/analyze/trends")
def trends(payload: TrendsPayload):
    return analyze_trends(payload.model_dump())


@app.post("/analyze/billing")
def billing(payload: TasksPayload):
    return analyze_billing_tasks(payload.tasks)


@app.post("/analyze/insights")
def insights(payload: InsightsPayload):
    return analyze_insights(payload.model_dump())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5100)
