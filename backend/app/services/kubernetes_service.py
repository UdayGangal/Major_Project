import json
import subprocess

from ..config import KUBECTL_BIN, LOG_TAIL, TECHNIQUES


class KubernetesError(RuntimeError):
    pass


def kubectl(args, timeout=20):
    try:
        result = subprocess.run(
            [KUBECTL_BIN, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
        )
        return result.stdout

    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
    ) as exc:
        detail = getattr(exc, "stderr", None) or str(exc)
        raise KubernetesError(detail.strip()) from exc


def get_pods(technique):
    config = TECHNIQUES[technique]

    output = kubectl([
        "get", "pods",
        "-n", config["namespace"],
        "-l", config["selector"],
        "-o", "json",
    ])

    return json.loads(output).get("items", [])


def get_pod_status(technique):
    rows = []

    for pod in get_pods(technique):
        metadata = pod.get("metadata", {})
        status = pod.get("status", {})

        ready = any(
            condition.get("type") == "Ready"
            and condition.get("status") == "True"
            for condition in status.get("conditions", [])
        )

        rows.append({
            "name": metadata.get("name"),
            "phase": status.get("phase", "Unknown"),
            "ready": ready,
            "version": metadata.get("labels", {}).get("version", "—"),
            "created_at": metadata.get("creationTimestamp"),
        })

    return rows


def get_pod_logs(technique):
    config = TECHNIQUES[technique]
    namespace = config["namespace"]

    rows = []

    for pod in get_pods(technique):
        name = pod.get("metadata", {}).get("name", "unknown")

        try:
            output = kubectl([
                "logs",
                name,
                "-n", namespace,
                f"--tail={LOG_TAIL}",
                "--timestamps=true",
            ], timeout=15)

            rows.extend(
                {"source": name, "message": line}
                for line in output.splitlines()
                if line.strip()
            )

        except KubernetesError as exc:
            rows.append({
                "source": name,
                "message": f"[log retrieval error] {exc}",
            })

    return rows