
import asyncio
import logging
import os
import subprocess

from ..config import TECHNIQUES, KUBECTL_BIN

logger = logging.getLogger(__name__)


class PortForwardManager:
    def __init__(self):
        self.processes = {}
        self.tasks = {}
        self.restart_delay = 2

    async def start(self):
        for strategy, config in TECHNIQUES.items():
            task = self.tasks.get(strategy)

            if task is None or task.done():
                self.tasks[strategy] = asyncio.create_task(
                    self._run(strategy, config)
                )

        logger.info("All four port-forward managers started.")

    async def _run(self, strategy, config):
        local_port = config["local_port"]
        namespace = config["namespace"]
        service = config["service"]

        while True:
            process = None

            try:
                command = [
                    KUBECTL_BIN,
                    "port-forward",
                    "-n", namespace,
                    f"service/{service}",
                    f"{local_port}:80",
                    "--address=127.0.0.1",
                ]

                logger.info(
                    "Starting %s port-forward: localhost:%s -> %s/%s",
                    strategy, local_port, namespace, service,
                )

                creation_flags = (
                    subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                )

                process = subprocess.Popen(
                    command,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creation_flags,
                )

                self.processes[strategy] = process

                return_code = await asyncio.to_thread(process.wait)

                logger.warning(
                    "%s port-forward exited with code %s",
                    strategy, return_code,
                )

            except asyncio.CancelledError:
                if process and process.poll() is None:
                    process.terminate()
                    try:
                        await asyncio.to_thread(process.wait, timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        await asyncio.to_thread(process.wait)
                raise

            except Exception:
                logger.exception(
                    "Port-forward manager failed for %s", strategy
                )

            finally:
                if self.processes.get(strategy) is process:
                    self.processes.pop(strategy, None)

            await asyncio.sleep(self.restart_delay)

    async def restart_strategy(self, strategy: str, timeout: int = 20):
        if strategy not in TECHNIQUES:
            raise ValueError(f"Unknown strategy: {strategy}")

        task = self.tasks.get(strategy)

        if task is None or task.done():
            raise RuntimeError(
                f"Port-forward task for {strategy} is not running"
            )

        old_process = self.processes.get(strategy)
        old_pid = old_process.pid if old_process else None

        if old_process and old_process.poll() is None:
            old_process.terminate()

            try:
                await asyncio.to_thread(old_process.wait, timeout=5)
            except subprocess.TimeoutExpired:
                old_process.kill()
                await asyncio.to_thread(old_process.wait)

        port = TECHNIQUES[strategy]["local_port"]
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout

        while loop.time() < deadline:
            new_process = self.processes.get(strategy)

            if (
                new_process is not None
                and new_process.pid != old_pid
                and new_process.poll() is None
            ):
                try:
                    reader, writer = await asyncio.wait_for(
                        asyncio.open_connection("127.0.0.1", port),
                        timeout=0.5,
                    )

                    writer.close()
                    await writer.wait_closed()

                    logger.info(
                        "%s port-forward ready on port %s",
                        strategy, port,
                    )
                    return

                except (OSError, asyncio.TimeoutError):
                    pass

            await asyncio.sleep(0.25)

        raise RuntimeError(
            f"{strategy} port-forward failed to restart on port {port}"
        )

    def get_status(self):
        result = {}

        for strategy, config in TECHNIQUES.items():
            process = self.processes.get(strategy)

            result[strategy] = {
                "name": config["name"],
                "port": config["local_port"],
                "url": f"http://localhost:{config['local_port']}",
                "running": (
                    process is not None and process.poll() is None
                ),
                "service": config["service"],
                "namespace": config["namespace"],
            }

        return result

    async def stop(self):
        for task in self.tasks.values():
            task.cancel()

        await asyncio.gather(
            *self.tasks.values(),
            return_exceptions=True,
        )

        self.tasks.clear()

        for process in self.processes.values():
            if process.poll() is None:
                process.terminate()

                try:
                    await asyncio.to_thread(process.wait, timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    await asyncio.to_thread(process.wait)

        self.processes.clear()
        logger.info("All port-forward managers stopped.")


port_forward_manager = PortForwardManager()
