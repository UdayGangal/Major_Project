
import asyncio
import logging
import subprocess

from ..config import TECHNIQUES, KUBECTL_BIN

logger = logging.getLogger(__name__)


class PortForwardManager:
    def __init__(self, local_port=8081):
        self.local_port = local_port
        self.strategy = "recreate"
        self.process = None
        self.task = None
        self.lock = asyncio.Lock()
        self.restart_delay = 2

    async def start(self):
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._run())
            logger.info("Port-forward manager started.")

    async def set_strategy(self, strategy):
        if strategy not in TECHNIQUES:
            raise ValueError(f"Unknown strategy: {strategy}")

        async with self.lock:
            if strategy == self.strategy:
                return

            self.strategy = strategy
            await self._stop_process()

        logger.info("Website strategy switched to: %s", strategy)

    async def _stop_process(self):
        process = self.process

        if process is None:
            return

        self.process = None

        if process.poll() is None:
            process.terminate()

            try:
                await asyncio.to_thread(process.wait, timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                await asyncio.to_thread(process.wait)

    async def _run(self):
        while True:
            try:
                async with self.lock:
                    strategy = self.strategy
                    config = TECHNIQUES[strategy]

                    command = [
                        KUBECTL_BIN,
                        "port-forward",
                        "-n", config["namespace"],
                        f"service/{config['service']}",
                        f"{self.local_port}:80",
                        "--address=127.0.0.1",
                    ]

                    logger.info(
                        "Starting port-forward: localhost:%s -> %s/%s",
                        self.local_port,
                        config["namespace"],
                        config["service"],
                    )

                    process = subprocess.Popen(
                        command,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )

                    self.process = process

                return_code = await asyncio.to_thread(process.wait)

                logger.warning(
                    "Port-forward exited for %s (code %s). "
                    "Restarting in %s seconds.",
                    strategy,
                    return_code,
                    self.restart_delay,
                )

            except asyncio.CancelledError:
                await self._stop_process()
                raise

            except Exception:
                logger.exception("Port-forward manager error")

            finally:
                if self.process is not None:
                    if self.process.poll() is not None:
                        self.process = None

            await asyncio.sleep(self.restart_delay)

    async def stop(self):
        if self.task:
            self.task.cancel()
            await asyncio.gather(
                self.task,
                return_exceptions=True,
            )
            self.task = None

        await self._stop_process()
        logger.info("Port-forward manager stopped.")


port_forward_manager = PortForwardManager()
