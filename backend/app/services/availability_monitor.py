
import asyncio
import logging
from datetime import datetime, timezone
from urllib.request import urlopen
from urllib.error import URLError
from uuid import UUID

from ..config import TECHNIQUES
from ..database import SessionLocal
from ..models import SiteOutage, AvailabilityResult

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 1
REQUEST_TIMEOUT = 2
FAILURE_THRESHOLD = 2


def check_website(url):
    try:
        with urlopen(url, timeout=REQUEST_TIMEOUT) as response:
            return 200 <= response.status < 300, None
    except Exception as exc:
        return False, str(exc)


class StrategyMonitor:
    def __init__(self, strategy, run_id):
        self.strategy = strategy
        self.run_id = run_id
        self.url = (
            f"http://127.0.0.1:{TECHNIQUES[strategy]['local_port']}/health"
        )

        self.task = None
        self.is_down = False
        self.failure_count = 0
        self.first_failure_at = None
        self.outage_id = None

        self.total_checks = 0
        self.failed_checks = 0
        self.outage_count = 0
        self.total_downtime_seconds = 0.0

        self.started_at = datetime.now(timezone.utc)

    def create_result(self):
        db = SessionLocal()
        try:
            result = AvailabilityResult(
                run_id=self.run_id,
                technique=self.strategy,
                monitoring_started_at=self.started_at,
                total_checks=0,
                failed_checks=0,
                outage_count=0,
                total_downtime_seconds=0.0,
                zero_downtime=None,
                status="RUNNING",
            )
            db.add(result)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not create availability result")
            raise
        finally:
            db.close()

    async def start(self):
        self.create_result()
        self.task = asyncio.create_task(self._run())
        logger.info("Availability monitoring started: %s", self.strategy)

    async def _run(self):
        while True:
            try:
                healthy, error = await asyncio.to_thread(
                    check_website, self.url
                )
                now = datetime.now(timezone.utc)

                self.total_checks += 1

                if healthy:
                    self.failure_count = 0

                    if self.is_down:
                        self._record_recovery(now)
                else:
                    self.failed_checks += 1

                    if self.failure_count == 0:
                        self.first_failure_at = now

                    self.failure_count += 1

                    if (
                        self.failure_count >= FAILURE_THRESHOLD
                        and not self.is_down
                    ):
                        self._record_outage(self.first_failure_at, error)

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Availability check failed for %s", self.strategy
                )

            await asyncio.sleep(CHECK_INTERVAL)

    def _record_outage(self, started_at, error):
        db = SessionLocal()
        try:
            outage = SiteOutage(
                run_id=self.run_id,
                site_url=self.url,
                strategy=self.strategy,
                status="DOWN",
                outage_started_at=started_at,
                error_message=error,
            )
            db.add(outage)
            db.commit()
            db.refresh(outage)

            self.outage_id = outage.id
            self.is_down = True
            self.outage_count += 1

            logger.warning(
                "%s outage recorded for run %s",
                self.strategy,
                self.run_id,
            )
        except Exception:
            db.rollback()
            logger.exception("Could not save outage for %s", self.strategy)
        finally:
            db.close()

    def _record_recovery(self, recovered_at):
        if self.outage_id is None:
            self.is_down = False
            self.first_failure_at = None
            return

        db = SessionLocal()
        try:
            outage = (
                db.query(SiteOutage)
                .filter(SiteOutage.id == self.outage_id)
                .first()
            )

            if outage and outage.recovered_at is None:
                outage.recovered_at = recovered_at
                outage.status = "RECOVERED"
                outage.downtime_seconds = (
                    recovered_at - outage.outage_started_at
                ).total_seconds()

                self.total_downtime_seconds += outage.downtime_seconds
                db.commit()

            self.is_down = False
            self.outage_id = None
            self.first_failure_at = None

        except Exception:
            db.rollback()
            logger.exception("Could not save recovery for %s", self.strategy)
        finally:
            db.close()

    async def stop(self):
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
            self.task = None

        ended_at = datetime.now(timezone.utc)

        # Close an outage that is still active when the run finishes.
        if self.is_down and self.outage_id is not None:
            self._record_recovery(ended_at)

        db = SessionLocal()
        try:
            result = (
                db.query(AvailabilityResult)
                .filter(AvailabilityResult.run_id == self.run_id)
                .first()
            )

            if result:
                result.monitoring_ended_at = ended_at
                result.total_checks = self.total_checks
                result.failed_checks = self.failed_checks
                result.outage_count = self.outage_count
                result.total_downtime_seconds = self.total_downtime_seconds
                result.zero_downtime = self.outage_count == 0
                result.status = "COMPLETED"

                db.commit()

        except Exception:
            db.rollback()
            logger.exception("Could not finalize availability result")
            raise
        finally:
            db.close()

        logger.info("Availability monitoring finished: %s", self.strategy)


class AvailabilityMonitor:
    def __init__(self):
        self.monitors = {}

    async def start(self, strategy, run_id):
        if strategy in self.monitors:
            raise RuntimeError(
                f"Availability monitor already running for {strategy}"
            )

        monitor = StrategyMonitor(strategy, run_id)
        await monitor.start()
        self.monitors[strategy] = monitor

    async def stop(self, strategy, run_id):
        monitor = self.monitors.get(strategy)

        if monitor and monitor.run_id == run_id:
            await monitor.stop()
            del self.monitors[strategy]

    async def stop_all(self):
        for strategy, monitor in list(self.monitors.items()):
            await monitor.stop()
            del self.monitors[strategy]


availability_monitor = AvailabilityMonitor()
