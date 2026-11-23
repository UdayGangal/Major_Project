
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DeploymentRun, DeploymentEvent
from ..config import TECHNIQUES
from ..schemas import StartRunRequest
from ..services.collector import start_collector, stop_collector
from pydantic import BaseModel


router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("/start")
async def start_run(
    payload: StartRunRequest,
    db: Session = Depends(get_db)
):
    if payload.technique not in TECHNIQUES:
        raise HTTPException(400, "Invalid technique")

    active = (
        db.query(DeploymentRun)
        .filter_by(
            technique=payload.technique,
            status="running"
        )
        .first()
    )

    if active:
        raise HTTPException(
            409,
            f"Run already active: {active.run_id}"
        )

    run = DeploymentRun(
        technique=payload.technique,
        source_version=payload.source_version,
        target_version=payload.target_version,
        application_url=payload.application_url,
        status="running"
    )

    db.add(run)
    db.flush()

    db.add(
        DeploymentEvent(
            run_id=run.run_id,
            event_type="RUN_STARTED",
            message=f'{TECHNIQUES[payload.technique]["name"]} monitoring run started'
        )
    )

    db.commit()
    db.refresh(run)

    # Now this executes inside FastAPI's running event loop.
    start_collector(run.run_id, run.technique)

    return {
        "run_id": str(run.run_id),
        "technique": run.technique,
        "status": run.status,
        "started_at": run.started_at
    }


@router.post("/{run_id}/finish")
async def finish_run(
    run_id: UUID,
    db: Session = Depends(get_db)
):
    run = (
        db.query(DeploymentRun)
        .filter_by(run_id=run_id)
        .first()
    )

    if not run:
        raise HTTPException(404, "Run not found")

    if run.status == "running":
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)

        db.add(
            DeploymentEvent(
                run_id=run_id,
                event_type="RUN_FINISHED",
                message="Monitoring run finished"
            )
        )

        db.commit()
        stop_collector(run_id)

    return {
        "run_id": str(run_id),
        "status": run.status,
        "completed_at": run.completed_at
    }


class EventRequest(BaseModel):
    event_type: str
    message: str = ""


@router.post("/{run_id}/events")
def record_event(
    run_id: UUID,
    payload: EventRequest,
    db: Session = Depends(get_db),
):
    allowed_events = {
        "DEPLOYMENT_STARTED",
        "DEPLOYMENT_COMPLETED",
        "ROLLBACK_STARTED",
        "ROLLBACK_COMPLETED",
        "SERVICE_UNAVAILABLE",
        "SERVICE_RECOVERED",
    }

    if payload.event_type not in allowed_events:
        raise HTTPException(400, "Unsupported event type")

    run = db.query(DeploymentRun).filter_by(run_id=run_id).first()

    if not run:
        raise HTTPException(404, "Run not found")

    event = DeploymentEvent(
        run_id=run_id,
        event_type=payload.event_type,
        message=payload.message or payload.event_type,
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    return {
        "event_type": event.event_type,
        "created_at": event.created_at,
    }