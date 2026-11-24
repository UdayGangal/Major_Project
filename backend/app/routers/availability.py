
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
        query = query.filter(AvailabilityResult.technique == strategy)

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


@router.get("/status")
def get_availability_status(db: Session = Depends(get_db)):
    results = (
        db.query(AvailabilityResult)
        .order_by(AvailabilityResult.monitoring_started_at.desc())
        .all()
    )

    latest_by_strategy = {}

    for row in results:
        if row.technique not in latest_by_strategy:
            latest_by_strategy[row.technique] = row

    return {
        strategy: {
            "run_id": str(row.run_id),
            "status": row.status,
            "total_checks": row.total_checks,
            "failed_checks": row.failed_checks,
            "outage_count": row.outage_count,
            "total_downtime_seconds": row.total_downtime_seconds,
            "zero_downtime": row.zero_downtime,
            "monitoring_started_at": row.monitoring_started_at,
            "monitoring_ended_at": row.monitoring_ended_at,
        }
        for strategy, row in latest_by_strategy.items()
    }


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
