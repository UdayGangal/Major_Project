import asyncio
import logging
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from ..config import TECHNIQUES
from ..database import SessionLocal
from ..models import SiteOutage, AvailabilityResult

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 1
REQUEST_TIMEOUT = 2
FAILURE_THRESHOLD = 2


def check_website(url, strategy=None):
    """Probe the user-facing route, including the required Istio Host header."""
    headers = {
        "Connection": "close",
        "Cache-Control": "no-cache",
    }
    host = TECHNIQUES.get(strategy, {}).get("health_host")
    if host:
        headers["Host"] = host

    try:
        request = Request(url, headers=headers)
        with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            if 200 <= response.status < 300:
                return True, None
            return False, f"HTTP {response.status}"
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
        self.completed_downtime = 0.0

        self.started_at = datetime.now(timezone.utc)

    def _create_or_resume_result(self):
        """
        Reuse the unique AvailabilityResult for this run after a backend reload.

        AvailabilityResult.run_id is unique. Blindly inserting another row
        causes an IntegrityError and prevents the monitor task from restarting.
        Restore counters and any open outage so a successful probe can recover it.
        """
        db = SessionLocal()
        try:
            result = (
                db.query(AvailabilityResult)
                .filter(AvailabilityResult.run_id == self.run_id)
                .first()
            )

            if result is None:
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
            else:
                self.started_at = result.monitoring_started_at
                self.total_checks = result.total_checks or 0
                self.failed_checks = result.failed_checks or 0
                self.outage_count = result.outage_count or 0

                recovered_rows = (
                    db.query(SiteOutage)
                    .filter(
                        SiteOutage.run_id == self.run_id,
                        SiteOutage.recovered_at.isnot(None),
                    )
                    .all()
                )
                self.completed_downtime = sum(
                    float(row.downtime_seconds or 0.0)
                    for row in recovered_rows
                )

                active_outage = (
                    db.query(SiteOutage)
                    .filter(
                        SiteOutage.run_id == self.run_id,
                        SiteOutage.strategy == self.strategy,
                        SiteOutage.status == "DOWN",
                        SiteOutage.recovered_at.is_(None),
                    )
                    .order_by(SiteOutage.outage_started_at.desc())
                    .first()
                )

                if active_outage:
                    self.is_down = True
                    self.outage_id = active_outage.id
                    self.first_failure_at = active_outage.outage_started_at

                # A backend restart must not turn an in-progress run into a
                # completed experiment. Mark the existing result live again.
                result.status = "RUNNING"
                result.monitoring_ended_at = None
                db.commit()

        except Exception:
            db.rollback()
            logger.exception(
                "Could not create/resume availability result for %s",
                self.strategy,
            )
            raise
        finally:
            db.close()

    async def start(self):
        self._create_or_resume_result()
        self.task = asyncio.create_task(self._run())
        logger.info(
            "Availability monitor started/resumed: strategy=%s run=%s url=%s host=%s",
            self.strategy,
            self.run_id,
            self.url,
            TECHNIQUES[self.strategy].get("health_host", "default"),
        )

    async def _run(self):
        while True:
            try:
                healthy, error = await asyncio.to_thread(
                    check_website,
                    self.url,
                    self.strategy,
                )
                now = datetime.now(timezone.utc)
                self.total_checks += 1

                if healthy:
                    self.failure_count = 0
                    if self.is_down and self.outage_id is not None:
                        self._record_recovery(now)
                    else:
                        # On recovery after a process restart, the outage_id
                        # has been restored from PostgreSQL by _create_or_resume_result.
                        self.first_failure_at = None
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

                self._save_live_progress(now)

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Monitor error for strategy %s",
                    self.strategy,
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
                "%s is DOWN. Outage ID=%s, run=%s",
                self.strategy,
                outage.id,
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
                outage.downtime_seconds = max(
                    0.0,
                    (recovered_at - outage.outage_started_at).total_seconds(),
                )
                self.completed_downtime += outage.downtime_seconds
                db.commit()

                logger.info(
                    "%s recovered after %.2f seconds",
                    self.strategy,
                    outage.downtime_seconds,
                )

            self.is_down = False
            self.outage_id = None
            self.first_failure_at = None

        except Exception:
            db.rollback()
            logger.exception("Could not save recovery for %s", self.strategy)
        finally:
            db.close()

    def _save_live_progress(self, now):
        active_downtime = 0.0
        db = SessionLocal()
        try:
            if self.is_down and self.outage_id is not None:
                outage = (
                    db.query(SiteOutage)
                    .filter(SiteOutage.id == self.outage_id)
                    .first()
                )
                if outage and outage.recovered_at is None:
                    active_downtime = max(
                        0.0,
                        (now - outage.outage_started_at).total_seconds(),
                    )
                    outage.downtime_seconds = active_downtime

            result = (
                db.query(AvailabilityResult)
                .filter(AvailabilityResult.run_id == self.run_id)
                .first()
            )
            if result:
                result.total_checks = self.total_checks
                result.failed_checks = self.failed_checks
                result.outage_count = self.outage_count
                result.total_downtime_seconds = (
                    self.completed_downtime + active_downtime
                )
                result.zero_downtime = (
                    False if self.outage_count > 0 else None
                )
                result.status = "RUNNING"
                result.monitoring_ended_at = None

            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "Could not update live availability for %s",
                self.strategy,
            )
        finally:
            db.close()

    async def stop(self, finalize=True):
        """
        Stop this process's task.

        finalize=True is used by the explicit /finish endpoint.
        finalize=False is used during FastAPI shutdown/reload: preserve RUNNING
        state in PostgreSQL so the run can resume when the backend starts again.
        """
        if self.task:
            self.task.cancel()
            await asyncio.gather(
                self.task,
                return_exceptions=True,
            )
            self.task = None

        now = datetime.now(timezone.utc)
        active_downtime = 0.0

        db = SessionLocal()
        try:
            if self.is_down and self.outage_id is not None:
                outage = (
                    db.query(SiteOutage)
                    .filter(SiteOutage.id == self.outage_id)
                    .first()
                )
                if outage and outage.recovered_at is None:
                    active_downtime = max(
                        0.0,
                        (now - outage.outage_started_at).total_seconds(),
                    )
                    outage.downtime_seconds = active_downtime

            result = (
                db.query(AvailabilityResult)
                .filter(AvailabilityResult.run_id == self.run_id)
                .first()
            )
            if result:
                result.total_checks = self.total_checks
                result.failed_checks = self.failed_checks
                result.outage_count = self.outage_count
                result.total_downtime_seconds = (
                    self.completed_downtime + active_downtime
                )

                if finalize:
                    result.monitoring_ended_at = now
                    result.zero_downtime = self.outage_count == 0
                    result.status = "COMPLETED"
                else:
                    # App reload is not the end of the user's experiment.
                    result.monitoring_ended_at = None
                    result.status = "RUNNING"

            db.commit()

        except Exception:
            db.rollback()
            logger.exception(
                "Could not stop availability monitor for %s",
                self.strategy,
            )
            raise
        finally:
            db.close()

        logger.info(
            "Availability monitor stopped: strategy=%s run=%s finalize=%s",
            self.strategy,
            self.run_id,
            finalize,
        )


class AvailabilityMonitor:
    def __init__(self):
        self.monitors = {}

    async def start(self, strategy, run_id):
        existing = self.monitors.get(strategy)
        if (
            existing
            and existing.run_id == run_id
            and existing.task
            and not existing.task.done()
        ):
            return

        if existing:
            await existing.stop(finalize=False)
            self.monitors.pop(strategy, None)

        monitor = StrategyMonitor(strategy, run_id)
        await monitor.start()
        self.monitors[strategy] = monitor

    async def stop(self, strategy, run_id):
        monitor = self.monitors.get(strategy)
        if monitor and monitor.run_id == run_id:
            await monitor.stop(finalize=True)
            self.monitors.pop(strategy, None)

    async def stop_all(self):
        # Backend reload must not mark DB experiments as completed. The
        # /api/runs/start endpoint resumes active DB runs on next workspace open.
        for strategy, monitor in list(self.monitors.items()):
            await monitor.stop(finalize=False)
            self.monitors.pop(strategy, None)


availability_monitor = AvailabilityMonitor()
