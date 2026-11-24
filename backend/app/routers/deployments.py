from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import DeploymentRun, DeploymentEvent
from ..config import TECHNIQUES
from ..schemas import StartRunRequest
from ..services.collector import start_collector, stop_collector
from ..services.availability_monitor import availability_monitor
from ..services.kubernetes_service import get_deployed_version, KubernetesError

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("/start")
async def start_run(payload: StartRunRequest, db: Session = Depends(get_db)):
    technique = payload.technique
    if technique not in TECHNIQUES:
        raise HTTPException(400, "Invalid technique")

    active = (
        db.query(DeploymentRun)
        .filter_by(technique=technique, status="running")
        .first()
    )

    # Idempotent start: if a run already exists, reuse it. If the API process
    # restarted and its in-memory tasks disappeared, resume those tasks rather
    # than returning 409 or creating a duplicate AvailabilityResult.
    if active:
        try:
            start_collector(active.run_id, active.technique)
            await availability_monitor.start(active.technique, active.run_id)
        except RuntimeError as exc:
            # A monitor already running for this same strategy is expected.
            if "already running" not in str(exc).lower():
                raise HTTPException(500, f"Could not resume monitoring: {exc}") from exc
        except Exception as exc:
            raise HTTPException(500, f"Could not resume monitoring: {exc}") from exc

        return {
            "run_id": str(active.run_id),
            "technique": active.technique,
            "source_version": active.source_version,
            "target_version": active.target_version,
            "status": active.status,
            "started_at": active.started_at,
            "reused": True,
        }

    try:
        source_version = get_deployed_version(technique)
    except KubernetesError as exc:
        raise HTTPException(503, f"Could not detect source version: {exc}") from exc

    run = DeploymentRun(
        technique=technique,
        source_version=source_version,
        target_version="pending",
        application_url=payload.application_url,
        status="running",
    )
    db.add(run)
    db.flush()
    db.add(DeploymentEvent(
        run_id=run.run_id,
        event_type="RUN_STARTED",
        message=(f'{TECHNIQUES[technique]["name"]} monitoring started. '
                 f'Source version detected: {source_version}'),
    ))
    db.commit()
    db.refresh(run)

    try:
        start_collector(run.run_id, run.technique)
        await availability_monitor.start(run.technique, run.run_id)
    except Exception as exc:
        run.status = "failed"
        db.commit()
        stop_collector(run.run_id)
        raise HTTPException(500, f"Could not start availability monitoring: {exc}") from exc

    return {
        "run_id": str(run.run_id),
        "technique": run.technique,
        "source_version": run.source_version,
        "target_version": run.target_version,
        "status": run.status,
        "started_at": run.started_at,
        "reused": False,
    }


@router.post("/{run_id}/finish")
async def finish_run(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(DeploymentRun).filter_by(run_id=run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")

    if run.status == "running":
        try:
            target_version = get_deployed_version(run.technique)
        except KubernetesError as exc:
            raise HTTPException(
                503,
                f"Could not detect target version. Run remains active: {exc}",
            ) from exc

        run.target_version = target_version
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        db.add(DeploymentEvent(
            run_id=run_id,
            event_type="RUN_FINISHED",
            message=(f"Monitoring finished. Source: {run.source_version}; "
                     f"Target: {target_version}"),
        ))
        db.commit()
        db.refresh(run)
        stop_collector(run_id)
        await availability_monitor.stop(run.technique, run.run_id)

    return {
        "run_id": str(run_id),
        "technique": run.technique,
        "source_version": run.source_version,
        "target_version": run.target_version,
        "status": run.status,
        "completed_at": run.completed_at,
    }


class EventRequest(BaseModel):
    event_type: str
    message: str = ""


@router.post("/{run_id}/events")
def record_event(run_id: UUID, payload: EventRequest, db: Session = Depends(get_db)):
    allowed_events = {
        "DEPLOYMENT_STARTED", "DEPLOYMENT_COMPLETED", "ROLLBACK_STARTED",
        "ROLLBACK_COMPLETED", "SERVICE_UNAVAILABLE", "SERVICE_RECOVERED",
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
    return {"event_type": event.event_type, "created_at": event.created_at}
