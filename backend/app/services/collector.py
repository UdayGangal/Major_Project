
import asyncio
import hashlib
import logging
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from ..config import COLLECTION_INTERVAL
from ..database import SessionLocal
from ..models import (
    DeploymentRun,
    MetricSample,
    DeploymentEvent,
    DeploymentLog,
)
from .prometheus_service import get_analytics
from .kubernetes_service import get_pod_logs

logger = logging.getLogger(__name__)

tasks = {}
stops = {}


def store_logs(db, run_id, items):
    for item in items:
        msg = item["message"].strip()

        if not msg:
            continue

        fp = hashlib.sha256(
            f'{item["source"]}|{msg}'.encode(
                "utf-8", errors="replace"
            )
        ).hexdigest()

        level = (
            "ERROR"
            if any(
                word in msg.lower()
                for word in ("error", "exception", "failed")
            )
            else "INFO"
        )

        db.add(
            DeploymentLog(
                run_id=run_id,
                source=item["source"],
                level=level,
                message=msg,
                fingerprint=fp,
            )
        )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()


async def collect(run_id: UUID, technique: str):
    key = str(run_id)
    stop = asyncio.Event()
    stops[key] = stop

    try:
        while not stop.is_set():
            db = SessionLocal()

            try:
                run = (
                    db.query(DeploymentRun)
                    .filter_by(
                        run_id=run_id,
                        status="running"
                    )
                    .first()
                )

                if not run:
                    break

                # Fetch Prometheus metrics
                metrics = await asyncio.to_thread(
                    get_analytics, technique
                )

                # Store metrics in PostgreSQL
                sample = MetricSample(
                    run_id=run_id,
                    technique=technique,
                    requests_per_second=metrics["requests_per_second"],
                    error_rate=metrics["error_rate"],
                    p95_latency_ms=metrics["p95_latency_ms"],
                    healthy_pods=metrics["healthy_pods"],
                    total_pods=metrics["total_pods"],
                )

                db.add(sample)
                db.commit()

                logger.info(
                    "Metric sample stored for %s: RPS=%s",
                    technique,
                    metrics["requests_per_second"]
                )

                # Fetch logs in background thread.
                # Do NOT pass the SQLAlchemy session into that thread.
                try:
                    log_items = await asyncio.to_thread(
                        get_pod_logs, technique
                    )

                    store_logs(db, run_id, log_items)

                except Exception:
                    logger.exception(
                        "Log collection failed for %s",
                        run_id
                    )

            except Exception:
                db.rollback()

                logger.exception(
                    "Collection failed for %s",
                    run_id
                )

                try:
                    db.add(
                        DeploymentEvent(
                            run_id=run_id,
                            event_type="COLLECTION_ERROR",
                            message=(
                                "Metric or log collection failed; "
                                "inspect backend logs."
                            ),
                        )
                    )
                    db.commit()

                except Exception:
                    db.rollback()

            finally:
                db.close()

            try:
                await asyncio.wait_for(
                    stop.wait(),
                    timeout=COLLECTION_INTERVAL
                )
            except asyncio.TimeoutError:
                pass

    finally:
        stops.pop(key, None)
        tasks.pop(key, None)


def start_collector(run_id, technique):
    key = str(run_id)

    if key not in tasks or tasks[key].done():
        tasks[key] = asyncio.create_task(
            collect(run_id, technique)
        )

        logger.info(
            "Started collector for run %s (%s)",
            run_id,
            technique
        )


def stop_collector(run_id):
    event = stops.get(str(run_id))

    if event:
        event.set()
