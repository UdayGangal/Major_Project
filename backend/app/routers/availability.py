
import asyncio
import json
import subprocess

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SiteOutage, AvailabilityResult
from ..config import TECHNIQUES, KUBECTL_BIN
from ..services.port_forward_manager import port_forward_manager

router = APIRouter(
    prefix="/api/availability",
    tags=["availability"],
)


@router.get("/port-forwards")
def get_port_forwards():
    return port_forward_manager.get_status()


@router.post("/strategy/{strategy}")
def get_strategy_url(strategy: str):
    if strategy not in TECHNIQUES:
        raise HTTPException(400, "Invalid strategy")

    config = TECHNIQUES[strategy]

    return {
        "strategy": strategy,
        "website_url": f"http://localhost:{config['local_port']}",
        "message": "Dedicated port-forward is managed automatically.",
    }


@router.get("/status")
def get_availability_status(
    strategy: str = None,
    db: Session = Depends(get_db),
):
    if strategy is not None and strategy not in TECHNIQUES:
        raise HTTPException(400, "Invalid strategy")

    strategies = [strategy] if strategy else list(TECHNIQUES.keys())
    response = {}

    for current_strategy in strategies:
        result = (
            db.query(AvailabilityResult)
            .filter(AvailabilityResult.technique == current_strategy)
            .order_by(AvailabilityResult.monitoring_started_at.desc())
            .first()
        )

        if not result:
            response[current_strategy] = {
                "strategy": current_strategy,
                "monitoring_active": False,
                "site_status": "NOT_MONITORED",
                "is_down": False,
                "run_id": None,
                "outage_started_at": None,
                "last_recovered_at": None,
                "total_checks": 0,
                "failed_checks": 0,
                "outage_count": 0,
                "total_downtime_seconds": 0.0,
                "zero_downtime": None,
                "status": "NOT_STARTED",
            }
            continue

        active_outage = (
            db.query(SiteOutage)
            .filter(
                SiteOutage.run_id == result.run_id,
                SiteOutage.status == "DOWN",
                SiteOutage.recovered_at.is_(None),
            )
            .order_by(SiteOutage.outage_started_at.desc())
            .first()
        )

        last_recovery = (
            db.query(SiteOutage)
            .filter(
                SiteOutage.run_id == result.run_id,
                SiteOutage.recovered_at.isnot(None),
            )
            .order_by(SiteOutage.recovered_at.desc())
            .first()
        )

        is_down = active_outage is not None

        response[current_strategy] = {
            "strategy": current_strategy,
            "monitoring_active": result.status == "RUNNING",
            "site_status": "DOWN" if is_down else "UP",
            "is_down": is_down,
            "run_id": str(result.run_id),
            "outage_started_at": (
                active_outage.outage_started_at if active_outage else None
            ),
            "last_recovered_at": (
                last_recovery.recovered_at if last_recovery else None
            ),
            "total_checks": result.total_checks,
            "failed_checks": result.failed_checks,
            "outage_count": result.outage_count,
            "total_downtime_seconds": result.total_downtime_seconds,
            "zero_downtime": result.zero_downtime,
            "monitoring_started_at": result.monitoring_started_at,
            "monitoring_ended_at": result.monitoring_ended_at,
            "status": result.status,
        }

    return response


@router.get("/results")
def get_availability_results(
    strategy: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if strategy is not None and strategy not in TECHNIQUES:
        raise HTTPException(400, "Invalid strategy")

    query = db.query(AvailabilityResult)

    if strategy:
        query = query.filter(
            AvailabilityResult.technique == strategy
        )

    rows = (
        query
        .order_by(AvailabilityResult.monitoring_started_at.desc())
        .limit(min(max(limit, 1), 500))
        .all()
    )

    return [
        {
            "run_id": str(row.run_id),
            "strategy": row.technique,
            "monitoring_started_at": row.monitoring_started_at,
            "monitoring_ended_at": row.monitoring_ended_at,
            "total_checks": row.total_checks,
            "failed_checks": row.failed_checks,
            "outage_count": row.outage_count,
            "total_downtime_seconds": row.total_downtime_seconds,
            "zero_downtime": row.zero_downtime,
            "status": row.status,
        }
        for row in rows
    ]


@router.get("/outages")
def get_outages(
    strategy: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if strategy is not None and strategy not in TECHNIQUES:
        raise HTTPException(400, "Invalid strategy")

    query = db.query(SiteOutage)

    if strategy:
        query = query.filter(SiteOutage.strategy == strategy)

    rows = (
        query
        .order_by(SiteOutage.outage_started_at.desc())
        .limit(min(max(limit, 1), 500))
        .all()
    )

    return [
        {
            "id": row.id,
            "run_id": str(row.run_id) if row.run_id else None,
            "strategy": row.strategy,
            "site_url": row.site_url,
            "status": row.status,
            "outage_started_at": row.outage_started_at,
            "recovered_at": row.recovered_at,
            "downtime_seconds": row.downtime_seconds,
            "error_message": row.error_message,
        }
        for row in rows
    ]


@router.post("/blue-green/{version}")
async def switch_blue_green(version: str):
    if version not in ("blue", "green"):
        raise HTTPException(
            status_code=400,
            detail="Version must be blue or green"
        )

    patch = json.dumps({
        "spec": {
            "selector": {
                "app": "blue-green-demo",
                "version": version
            }
        }
    })

    try:
        result = await asyncio.to_thread(
            subprocess.run,
            [
                KUBECTL_BIN,
                "patch",
                "service",
                "blue-green-service",
                "--type=merge",
                "-p",
                patch,
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=True,
        )

    except subprocess.CalledProcessError as exc:
        raise HTTPException(
            status_code=500,
            detail=exc.stderr.strip() or "Kubernetes Service patch failed"
        ) from exc

    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=504,
            detail="Kubernetes Service patch timed out"
        ) from exc

    try:
        await port_forward_manager.restart_strategy("blue-green")

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Service switched to {version}, "
                f"but port-forward restart failed: {exc}"
            )
        ) from exc

    return {
        "strategy": "blue-green",
        "active_version": version,
        "website_url": "http://localhost:8083",
        "message": result.stdout.strip(),
    }
