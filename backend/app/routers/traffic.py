
import json
import os
import subprocess
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import KUBECTL_BIN, TECHNIQUES

router = APIRouter(prefix="/api/traffic", tags=["Traffic"])

# Active sessions are tracked by this backend process.
ACTIVE_SESSIONS = {}

K6_IMAGE = os.getenv("K6_IMAGE", "grafana/k6:latest")
PROMETHEUS_WRITE_URL = os.getenv(
    "K6_PROMETHEUS_RW_URL",
    "http://prometheus.default.svc.cluster.local:9090/api/v1/write",
)


class TrafficRequest(BaseModel):
    # None means all strategies (Overview page).
    strategy: str | None = None


def run_kubectl(args, input_data=None):
    try:
        result = subprocess.run(
            [KUBECTL_BIN, *args],
            input=input_data,
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        )
        return result.stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
            FileNotFoundError) as exc:
        detail = getattr(exc, "stderr", None) or str(exc)
        raise RuntimeError(detail.strip()) from exc


def create_traffic_job(strategy, session_id):
    config = TECHNIQUES[strategy]
    namespace = config["namespace"]

    suffix = uuid.uuid4().hex[:8]
    job_name = f"dashboard-k6-{strategy}-{suffix}"
    config_name = f"dashboard-k6-script-{suffix}"

    if strategy == "canary":
        target_url = (
            "http://istio-ingressgateway.istio-system.svc.cluster.local/"
        )
        headers = 'headers: { Host: "canary.localhost" },'
    else:
        service = config["service"]
        target_url = (
            f"http://{service}.{namespace}.svc.cluster.local/"
        )
        headers = ""

    script = f"""
import http from "k6/http";
import {{ check, sleep }} from "k6";

export const options = {{
  vus: 10,
  duration: "5m"
}};

export default function () {{
  const response = http.get(__ENV.TARGET_URL, {{
    {headers}
    timeout: "10s"
  }});

  check(response, {{
    "HTTP response received": (r) => r.status > 0
  }});

  sleep(1);
}}
"""

    config_map = {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": config_name,
            "namespace": namespace,
            "labels": {"traffic-session": session_id},
        },
        "data": {"test.js": script},
    }

    job = {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {
            "name": job_name,
            "namespace": namespace,
            "labels": {"traffic-session": session_id},
        },
        "spec": {
            "backoffLimit": 0,
            "activeDeadlineSeconds": 360,
            "ttlSecondsAfterFinished": 600,
            "template": {
                "metadata": {
                    "labels": {"traffic-session": session_id}
                },
                "spec": {
                    "restartPolicy": "Never",
                    "containers": [{
                        "name": "k6",
                        "image": K6_IMAGE,
                        "args": [
                            "run",
                            "-o",
                            "experimental-prometheus-rw",
                            "/scripts/test.js",
                        ],
                        "env": [
                            {"name": "TARGET_URL", "value": target_url},
                            {
                                "name": "K6_PROMETHEUS_RW_SERVER_URL",
                                "value": PROMETHEUS_WRITE_URL,
                            },
                        ],
                        "volumeMounts": [{
                            "name": "k6-script",
                            "mountPath": "/scripts",
                            "readOnly": True,
                        }],
                    }],
                    "volumes": [{
                        "name": "k6-script",
                        "configMap": {"name": config_name},
                    }],
                },
            },
        },
    }

    try:
        run_kubectl(
            ["apply", "-f", "-"],
            json.dumps(config_map),
        )
        run_kubectl(
            ["apply", "-f", "-"],
            json.dumps(job),
        )
    except RuntimeError:
        run_kubectl([
            "delete", "configmap", config_name,
            "-n", namespace, "--ignore-not-found=true",
        ])
        raise

    return {
        "strategy": strategy,
        "namespace": namespace,
        "job": job_name,
        "config_map": config_name,
    }


@router.post("/start")
def start_traffic(request: TrafficRequest):
    strategies = (
        [request.strategy]
        if request.strategy
        else list(TECHNIQUES.keys())
    )

    invalid = [s for s in strategies if s not in TECHNIQUES]
    if invalid:
        raise HTTPException(400, f"Unknown strategy: {invalid[0]}")

    session_id = str(uuid.uuid4())
    created = []

    try:
        for strategy in strategies:
            created.append(create_traffic_job(strategy, session_id))
    except RuntimeError as exc:
        for item in created:
            ns = item["namespace"]
            run_kubectl([
                "delete", "job", item["job"],
                "-n", ns, "--ignore-not-found=true",
            ])
            run_kubectl([
                "delete", "configmap", item["config_map"],
                "-n", ns, "--ignore-not-found=true",
            ])
        raise HTTPException(500, str(exc))

    ACTIVE_SESSIONS[session_id] = created

    return {
        "session_id": session_id,
        "message": "Traffic generation started",
        "strategies": strategies,
        "jobs": created,
    }


@router.post("/stop/{session_id}")
def stop_traffic(session_id: str):
    jobs = ACTIVE_SESSIONS.pop(session_id, None)

    if jobs is None:
        raise HTTPException(404, "Traffic session not found")

    errors = []

    for item in jobs:
        ns = item["namespace"]

        for resource, name in (
            ("job", item["job"]),
            ("configmap", item["config_map"]),
        ):
            try:
                run_kubectl([
                    "delete", resource, name,
                    "-n", ns, "--ignore-not-found=true",
                ])
            except RuntimeError as exc:
                errors.append(str(exc))

    if errors:
        raise HTTPException(500, "; ".join(errors))

    return {"message": "Traffic generation stopped"}
