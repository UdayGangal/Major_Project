
import asyncio
import logging
from datetime import datetime, timezone
from urllib.request import urlopen

from ..database import SessionLocal
from ..models import SiteOutage
from .port_forward_manager import port_forward_manager

logger = logging.getLogger(__name__)

SITE_URL = "http://127.0.0.1:8081/health"
CHECK_INTERVAL = 1
REQUEST_TIMEOUT = 2
FAILURE_THRESHOLD = 2


def check_website():
    try:
        with urlopen(SITE_URL, timeout=REQUEST_TIMEOUT) as response:
            healthy = 200 <= response.status < 300
            return healthy, None if healthy else f"HTTP {response.status}"

    except Exception as exc:
        return False, str(exc)


class AvailabilityMonitor:
    def __init__(self):
        self.task = None
        self.is_down = False
        self.failure_count = 0
        self.first_failure_at = None
        self.outage_id = None

    async def start(self):
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._run())
            logger.info("Website availability monitoring started.")

    async def _run(self):
        while True:
            try:
                is_healthy, error = await asyncio.to_thread(check_website)
                now = datetime.now(timezone.utc)

                if is_healthy:
                    self.failure_count = 0

                    if self.is_down:
                        self._record_recovery(now)
                        self.is_down = False
                        self.first_failure_at = None

                else:
                    if self.failure_count == 0:
                        self.first_failure_at = now

                    self.failure_count += 1

                    if (
                        self.failure_count >= FAILURE_THRESHOLD
                        and not self.is_down
                    ):
                        self._record_outage(
                            started_at=self.first_failure_at,
                            error=error,
                        )
                        self.is_down = True

            except asyncio.CancelledError:
                raise

            except Exception:
                logger.exception("Availability monitor error")

            await asyncio.sleep(CHECK_INTERVAL)

    def _record_outage(self, started_at, error):
        db = SessionLocal()

        try:
            outage = SiteOutage(
                site_url=SITE_URL,
                strategy=port_forward_manager.strategy,
                status="DOWN",
                outage_started_at=started_at,
                error_message=error,
            )

            db.add(outage)
            db.commit()
            db.refresh(outage)

            self.outage_id = outage.id

            logger.warning(
                "Website DOWN | Strategy: %s | Outage ID: %s",
                outage.strategy,
                outage.id,
            )

        except Exception:
            db.rollback()
            logger.exception("Could not save website outage")

        finally:
            db.close()

    def _record_recovery(self, recovered_at):
        if self.outage_id is None:
            logger.warning(
                "Website recovered, but no outage ID was saved."
            )
            return

        db = SessionLocal()

        try:
            outage = (
                db.query(SiteOutage)
                .filter_by(id=self.outage_id)
                .first()
            )

            if outage and outage.recovered_at is None:
                outage.recovered_at = recovered_at
                outage.status = "RECOVERED"

                outage.downtime_seconds = (
                    recovered_at - outage.outage_started_at
                ).total_seconds()

                db.commit()

                logger.info(
                    "Website RECOVERED | Strategy: %s | Downtime: %.2f seconds",
                    outage.strategy,
                    outage.downtime_seconds,
                )

        except Exception:
            db.rollback()
            logger.exception("Could not save website recovery")

        finally:
            db.close()

        self.outage_id = None

    async def stop(self):
        if self.task:
            self.task.cancel()
            await asyncio.gather(
                self.task,
                return_exceptions=True,
            )
            self.task = None

            logger.info("Website availability monitoring stopped.")


availability_monitor = AvailabilityMonitor()
