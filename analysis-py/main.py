from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any

from compute.text_analysis import analyze_text
from compute.statistics import analyze_stats
from compute.trends import analyze_trends
from compute.insights import analyze_insights

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


@app.get("/health")
def health():
    return {"status": "ok", "service": "analysis-py", "computedBy": "python"}


@app.post("/analyze/text")
def text_analysis(payload: TasksPayload):
    return analyze_text(payload.tasks)


@app.post("/analyze/stats")
def stats(payload: StatsPayload):
    return analyze_stats(payload.model_dump())


@app.post("/analyze/trends")
def trends(payload: TrendsPayload):
    return analyze_trends(payload.model_dump())


@app.post("/analyze/insights")
def insights(payload: InsightsPayload):
    return analyze_insights(payload.model_dump())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5100)
