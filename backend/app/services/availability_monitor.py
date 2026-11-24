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
    """Probe the configured route, including the required Istio Host header."""
    try:
        headers = {
            "Connection": "close",
            "Cache-Control": "no-cache",
        }

        # Istio selects the Canary VirtualService by HTTP Host.
        host = TECHNIQUES.get(strategy, {}).get("health_host")
        if host:
            headers["Host"] = host

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
        self.url = f"http://127.0.0.1:{TECHNIQUES[strategy]['local_port']}/health"
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

    def _create_result(self):
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
            logger.exception("Could not create availability result for %s", self.strategy)
            raise
        finally:
            db.close()

    async def start(self):
        self._create_result()
        self.task = asyncio.create_task(self._run())
        logger.info(
            "Availability monitor started: strategy=%s run=%s url=%s host=%s",
            self.strategy,
            self.run_id,
            self.url,
            TECHNIQUES[self.strategy].get("health_host", "default"),
        )

    async def _run(self):
        while True:
            try:
                healthy, error = await asyncio.to_thread(
                    check_website, self.url, self.strategy
                )
                now = datetime.now(timezone.utc)
                self.total_checks += 1

                if healthy:
                    self.failure_count = 0
                    if self.is_down:
                        self._record_recovery(now)
                    else:
                        # A backend restart can lose the in-memory outage_id.
                        # A successful probe is authoritative evidence that any
                        # previously-open outage for this strategy has recovered.
                        self._recover_stale_open_outages(now)
                        self.first_failure_at = None
                else:
                    self.failed_checks += 1
                    if self.failure_count == 0:
                        self.first_failure_at = now
                    self.failure_count += 1
                    if self.failure_count >= FAILURE_THRESHOLD and not self.is_down:
                        self._record_outage(self.first_failure_at, error)

                self._save_live_progress(now)

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Monitor error for strategy %s", self.strategy)

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
            logger.warning("%s is DOWN. Outage ID=%s, run=%s", self.strategy, outage.id, self.run_id)
        except Exception:
            db.rollback()
            logger.exception("Could not save outage for %s", self.strategy)
        finally:
            db.close()

    def _recover_stale_open_outages(self, recovered_at):
        """Close persisted DOWN rows if the monitor process restarted.

        The monitor's in-memory outage_id is lost on a backend reload. Once
        this same route returns HTTP 2xx, close any still-open outage rows for
        the strategy so the dashboard cannot remain stuck on DOWN.
        """
        db = SessionLocal()
        try:
            open_rows = (
                db.query(SiteOutage)
                .filter(
                    SiteOutage.strategy == self.strategy,
                    SiteOutage.status == "DOWN",
                    SiteOutage.recovered_at.is_(None),
                )
                .all()
            )

            affected_runs = set()
            for outage in open_rows:
                outage.recovered_at = recovered_at
                outage.status = "RECOVERED"
                outage.downtime_seconds = max(
                    0.0,
                    (recovered_at - outage.outage_started_at).total_seconds(),
                )
                if outage.run_id:
                    affected_runs.add(outage.run_id)

            for run_id in affected_runs:
                result = (
                    db.query(AvailabilityResult)
                    .filter(AvailabilityResult.run_id == run_id)
                    .first()
                )
                if result:
                    rows = (
                        db.query(SiteOutage)
                        .filter(SiteOutage.run_id == run_id)
                        .all()
                    )
                    result.total_downtime_seconds = sum(
                        float(row.downtime_seconds or 0.0) for row in rows
                    )

            if open_rows:
                db.commit()
                logger.info(
                    "Closed %s persisted outage(s) for %s after a successful health check",
                    len(open_rows),
                    self.strategy,
                )
        except Exception:
            db.rollback()
            logger.exception(
                "Could not reconcile stale outages for %s", self.strategy
            )
        finally:
            db.close()

    def _record_recovery(self, recovered_at):
        if self.outage_id is None:
            self.is_down = False
            self.first_failure_at = None
            return

        db = SessionLocal()
        try:
            outage = db.query(SiteOutage).filter(SiteOutage.id == self.outage_id).first()
            if outage and outage.recovered_at is None:
                outage.recovered_at = recovered_at
                outage.status = "RECOVERED"
                outage.downtime_seconds = max(
                    0.0, (recovered_at - outage.outage_started_at).total_seconds()
                )
                self.completed_downtime += outage.downtime_seconds
                db.commit()
                logger.info("%s recovered after %.2f seconds", self.strategy, outage.downtime_seconds)

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
                outage = db.query(SiteOutage).filter(SiteOutage.id == self.outage_id).first()
                if outage and outage.recovered_at is None:
                    active_downtime = max(
                        0.0, (now - outage.outage_started_at).total_seconds()
                    )
                    outage.downtime_seconds = active_downtime

            result = db.query(AvailabilityResult).filter(
                AvailabilityResult.run_id == self.run_id
            ).first()
            if result:
                result.total_checks = self.total_checks
                result.failed_checks = self.failed_checks
                result.outage_count = self.outage_count
                result.total_downtime_seconds = self.completed_downtime + active_downtime
                result.zero_downtime = False if self.outage_count > 0 else None
                result.status = "RUNNING"
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not update live availability for %s", self.strategy)
        finally:
            db.close()

    async def stop(self):
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
            self.task = None

        ended_at = datetime.now(timezone.utc)
        active_downtime = 0.0
        db = SessionLocal()
        try:
            if self.is_down and self.outage_id is not None:
                outage = db.query(SiteOutage).filter(SiteOutage.id == self.outage_id).first()
                if outage and outage.recovered_at is None:
                    active_downtime = max(
                        0.0, (ended_at - outage.outage_started_at).total_seconds()
                    )
                    outage.downtime_seconds = active_downtime

            result = db.query(AvailabilityResult).filter(
                AvailabilityResult.run_id == self.run_id
            ).first()
            if result:
                result.monitoring_ended_at = ended_at
                result.total_checks = self.total_checks
                result.failed_checks = self.failed_checks
                result.outage_count = self.outage_count
                result.total_downtime_seconds = self.completed_downtime + active_downtime
                result.zero_downtime = self.outage_count == 0
                result.status = "COMPLETED"
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not finalize availability for %s", self.strategy)
            raise
        finally:
            db.close()

        logger.info("Availability monitor stopped: %s, run=%s", self.strategy, self.run_id)


class AvailabilityMonitor:
    def __init__(self):
        self.monitors = {}

    async def start(self, strategy, run_id):
        if strategy in self.monitors:
            raise RuntimeError(f"Monitor already running for {strategy}")
        monitor = StrategyMonitor(strategy, run_id)
        await monitor.start()
        self.monitors[strategy] = monitor

    async def stop(self, strategy, run_id):
        monitor = self.monitors.get(strategy)
        if monitor and monitor.run_id == run_id:
            await monitor.stop()
            self.monitors.pop(strategy, None)

    async def stop_all(self):
        for strategy, monitor in list(self.monitors.items()):
            await monitor.stop()
            self.monitors.pop(strategy, None)


availability_monitor = AvailabilityMonitor()
