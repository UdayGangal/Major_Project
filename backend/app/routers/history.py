
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import TECHNIQUES
from ..models import (
    DeploymentRun,
    MetricSample,
    DeploymentEvent,
    DeploymentLog,
)

router = APIRouter(
    prefix="/api/history",
    tags=["history"],
)


@router.get("/{technique}")
def history(
    technique: str,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    if technique not in TECHNIQUES:
        raise HTTPException(404, "Unknown technique")

    rows = (
        db.query(DeploymentRun)
        .filter_by(technique=technique)
        .order_by(DeploymentRun.started_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )

    return [
        {
            "run_id": str(run.run_id),
            "technique": run.technique,
            "status": run.status,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
            "application_url": run.application_url,
        }
        for run in rows
    ]


@router.get("/run/{run_id}")
def run_details(
    run_id: UUID,
    db: Session = Depends(get_db),
):
    run = (
        db.query(DeploymentRun)
        .filter_by(run_id=run_id)
        .first()
    )

    if not run:
        raise HTTPException(404, "Run not found")

    samples = (
        db.query(MetricSample)
        .filter_by(run_id=run_id)
        .order_by(MetricSample.sampled_at.asc())
        .all()
    )

    events = (
        db.query(DeploymentEvent)
        .filter_by(run_id=run_id)
        .order_by(DeploymentEvent.created_at.asc())
        .all()
    )

    logs = (
        db.query(DeploymentLog)
        .filter_by(run_id=run_id)
        .order_by(DeploymentLog.created_at.asc())
        .limit(1000)
        .all()
    )

    event_times = {
        event.event_type: event.created_at
        for event in events
    }

    def duration_seconds(start_event, end_event):
        start = event_times.get(start_event)
        end = event_times.get(end_event)

        if start is None or end is None:
            return None

        return (end - start).total_seconds()

    return {
        "run": {
            "run_id": str(run.run_id),
            "technique": run.technique,
            "status": run.status,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
            "application_url": run.application_url,
        },

        "samples": [
            {
                "sampled_at": sample.sampled_at,

                "requests_per_second": sample.requests_per_second,
                "total_requests": sample.total_requests,
                "failed_requests": sample.failed_requests,
                "error_rate": sample.error_rate,

                "avg_latency_ms": sample.avg_latency_ms,
                "p95_latency_ms": sample.p95_latency_ms,
                "p99_latency_ms": sample.p99_latency_ms,

                "cpu_cores": sample.cpu_cores,
                "memory_bytes": sample.memory_bytes,

                "healthy_pods": sample.healthy_pods,
                "total_pods": sample.total_pods,
            }
            for sample in samples
        ],

        "events": [
            {
                "event_type": event.event_type,
                "message": event.message,
                "created_at": event.created_at,
            }
            for event in events
        ],

        "logs": [
            {
                "source": log.source,
                "level": log.level,
                "message": log.message,
                "created_at": log.created_at,
            }
            for log in logs
        ],

        "evaluation": {
            "rollback_time_seconds": duration_seconds(
                "ROLLBACK_STARTED",
                "ROLLBACK_COMPLETED",
            ),

            "downtime_seconds": duration_seconds(
                "SERVICE_UNAVAILABLE",
                "SERVICE_RECOVERED",
            ),

            "deployment_duration_seconds": duration_seconds(
                "DEPLOYMENT_STARTED",
                "DEPLOYMENT_COMPLETED",
            ),
        },
    }
