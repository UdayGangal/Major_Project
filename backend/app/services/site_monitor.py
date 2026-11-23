
import asyncio
import os
from datetime import datetime, timezone

import requests

from ..database import SessionLocal
from ..models import SiteOutage


HEALTH_URL = os.getenv(
    "DELIVERY_SITE_HEALTH_URL",
    "http://127.0.0.1:8081/health"
)

CHECK_INTERVAL = int(os.getenv("SITE_MONITOR_INTERVAL_SECONDS", "3"))
REQUEST_TIMEOUT = 3
FAILURE_THRESHOLD = 2


def check_website():
    response = requests.get(HEALTH_URL, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return True


async def monitor_website():
    consecutive_failures = 0
    first_failure_time = None
    first_error = None

    while True:
        try:
            await asyncio.to_thread(check_website)

            # Website is responding: close any active outage.
            consecutive_failures = 0
            first_failure_time = None
            first_error = None

            db = SessionLocal()
            try:
                outage = (
                    db.query(SiteOutage)
                    .filter(SiteOutage.recovered_at.is_(None))
                    .order_by(SiteOutage.outage_started_at.desc())
                    .first()
                )

                if outage:
                    recovered_at = datetime.now(timezone.utc)
                    outage.status = "RECOVERED"
                    outage.recovered_at = recovered_at
                    outage.downtime_seconds = max(
                        0,
                        (recovered_at - outage.outage_started_at).total_seconds()
                    )
                    db.commit()
            finally:
                db.close()

        except Exception as error:
            if consecutive_failures == 0:
                first_failure_time = datetime.now(timezone.utc)
                first_error = str(error)

            consecutive_failures += 1

            if consecutive_failures >= FAILURE_THRESHOLD:
                db = SessionLocal()
                try:
                    active_outage = (
                        db.query(SiteOutage)
                        .filter(SiteOutage.recovered_at.is_(None))
                        .first()
                    )

                    if not active_outage:
                        outage = SiteOutage(
                            site_url=HEALTH_URL,
                            status="DOWN",
                            outage_started_at=first_failure_time,
                            error_message=first_error
                        )
                        db.add(outage)
                        db.commit()
                finally:
                    db.close()

        await asyncio.sleep(CHECK_INTERVAL)
