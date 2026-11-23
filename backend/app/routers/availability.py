
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SiteOutage
from ..config import TECHNIQUES
from ..services.port_forward_manager import port_forward_manager

router = APIRouter(
    prefix="/api/availability",
    tags=["availability"],
)


@router.post("/strategy/{strategy}")
async def switch_strategy(strategy: str):
    if strategy not in TECHNIQUES:
        raise HTTPException(400, "Invalid strategy")

    await port_forward_manager.set_strategy(strategy)

    return {
        "strategy": strategy,
        "website_url": "http://localhost:8081",
        "message": "Website target updated",
    }


@router.get("/outages")
def get_outages(
    strategy: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if strategy is not None and strategy not in TECHNIQUES:
        raise HTTPException(400, "Invalid strategy")

    query = db.query(SiteOutage)

    rows = (
        query
        .order_by(SiteOutage.outage_started_at.desc())
        .limit(min(max(limit, 1), 500))
        .all()
    )

    return [
        {
            "id": row.id,
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
    latest = (
        db.query(SiteOutage)
        .order_by(SiteOutage.outage_started_at.desc())
        .first()
    )

    if latest and latest.recovered_at is None:
        return {
            "status": "DOWN",
            "outage_started_at": latest.outage_started_at,
            "website_url": "http://localhost:8081",
        }

    return {
        "status": "UP",
        "website_url": "http://localhost:8081",
    }


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
