
import asyncio
import json
import math
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import KUBECTL_BIN
from ..services.prometheus_service import query, PrometheusError

router = APIRouter(
    prefix="/api/canary/adaptive",
    tags=["Adaptive Canary"],
)

# Adaptive controller configuration
EVALUATION_SECONDS = 15
MIN_REQUESTS = 20
TARGET_SAMPLE_REQUESTS = 200

MAX_ERROR_RATE = 5.0
MAX_LATENCY_RATIO = 1.5

MIN_WEIGHT_STEP = 5
MAX_WEIGHT_STEP = 15
REQUIRED_HEALTHY_EVALUATIONS = 2

_state = {
    "running": False,
    "v1_weight": 90,
    "v2_weight": 10,
    "observed_v1_requests_per_second": 0.0,
    "observed_v2_requests_per_second": 0.0,
    "observed_v1_requests_5m": 0.0,
    "observed_v2_requests_5m": 0.0,
    "v1_error_rate": 0.0,
    "v2_error_rate": 0.0,
    "v1_p95_ms": 0.0,
    "v2_p95_ms": 0.0,
    "next_weight_step": 0,
    "healthy_evaluations": 0,
    "decision": "Not started",
    "reason": "Adaptive Canary is stopped",
    "last_evaluated_at": None,
    "history": [],
}

_task = None
_lock = asyncio.Lock()


class StartRequest(BaseModel):
    initial_v2_weight: int = Field(default=10, ge=1, le=50)


def _scalar(expression):
    result = query(expression)

    if not result:
        return 0.0

    return float(result[0]["value"][1])


def _version_metrics(version):
    selector = f'{{strategy="canary",version="{version}"}}'

    rps = _scalar(
        f"sum(rate(rolling_demo_http_requests_total{selector}[1m]))"
    )

    requests_5m = _scalar(
        f"sum(increase(rolling_demo_http_requests_total{selector}[5m]))"
    )

    error_rate = _scalar(
        f"""
        100 *
        sum(rate(
            rolling_demo_http_requests_total
            {{strategy="canary",version="{version}",status=~"5.."}}
            [1m]
        ))
        /
        clamp_min(
            sum(rate(
                rolling_demo_http_requests_total{selector}[1m]
            )),
            0.000001
        )
        """
    )

    p95 = _scalar(
        f"""
        histogram_quantile(
            0.95,
            sum by (le) (
                rate(
                    rolling_demo_http_request_duration_seconds_bucket
                    {selector}[1m]
                )
            )
        )
        """
    ) * 1000

    return {
        "rps": rps,
        "requests_5m": requests_5m,
        "error_rate": error_rate,
        "p95_ms": p95,
    }


def _apply_weights(v1, v2):
    patch = {
        "spec": {
            "http": [{
                "route": [
                    {
                        "destination": {
                            "host": "canary-service.canary.svc.cluster.local",
                            "subset": "v1",
                        },
                        "weight": int(v1),
                    },
                    {
                        "destination": {
                            "host": "canary-service.canary.svc.cluster.local",
                            "subset": "v2",
                        },
                        "weight": int(v2),
                    },
                ]
            }]
        }
    }

    result = subprocess.run(
        [
            KUBECTL_BIN,
            "patch",
            "virtualservice",
            "canary-routing",
            "-n",
            "canary",
            "--type=merge",
            "-p",
            json.dumps(patch),
        ],
        capture_output=True,
        text=True,
        timeout=20,
    )

    if result.returncode != 0:
        raise RuntimeError(
            (
                result.stderr
                or result.stdout
                or "kubectl patch failed"
            ).strip()
        )


def _record(decision, reason):
    item = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "v1_weight": _state["v1_weight"],
        "v2_weight": _state["v2_weight"],
        "decision": decision,
        "reason": reason,
        "observed_v1_rps": _state["observed_v1_requests_per_second"],
        "observed_v2_rps": _state["observed_v2_requests_per_second"],
        "observed_v1_requests_5m": _state["observed_v1_requests_5m"],
        "observed_v2_requests_5m": _state["observed_v2_requests_5m"],
        "v1_error_rate": _state["v1_error_rate"],
        "v2_error_rate": _state["v2_error_rate"],
        "v1_p95_ms": _state["v1_p95_ms"],
        "v2_p95_ms": _state["v2_p95_ms"],
        "next_weight_step": _state["next_weight_step"],
    }

    _state["history"].append(item)
    _state["history"] = _state["history"][-100:]

    _state["decision"] = decision
    _state["reason"] = reason
    _state["last_evaluated_at"] = item["timestamp"]


def _calculate_weight_step(v2_requests, v2_error, latency_ratio):
    sample_confidence = min(
        1.0,
        v2_requests / TARGET_SAMPLE_REQUESTS,
    )

    error_headroom = max(
        0.0,
        min(1.0, (MAX_ERROR_RATE - v2_error) / MAX_ERROR_RATE),
    )

    latency_headroom = (
        max(
            0.0,
            min(
                1.0,
                (MAX_LATENCY_RATIO - latency_ratio)
                / (MAX_LATENCY_RATIO - 1.0),
            ),
        )
        if latency_ratio > 0
        else 0.0
    )

    health_confidence = min(
        error_headroom,
        latency_headroom,
    )

    calculated_step = (
        MIN_WEIGHT_STEP
        + (
            MAX_WEIGHT_STEP - MIN_WEIGHT_STEP
        ) * sample_confidence * health_confidence
    )

    return max(
        MIN_WEIGHT_STEP,
        min(MAX_WEIGHT_STEP, math.floor(calculated_step)),
    )


async def _evaluate_loop():
    try:
        while _state["running"]:
            try:
                v1 = await asyncio.to_thread(
                    _version_metrics, "v1"
                )
                v2 = await asyncio.to_thread(
                    _version_metrics, "v2"
                )

                _state.update({
                    "observed_v1_requests_per_second": v1["rps"],
                    "observed_v2_requests_per_second": v2["rps"],
                    "observed_v1_requests_5m": v1["requests_5m"],
                    "observed_v2_requests_5m": v2["requests_5m"],
                    "v1_error_rate": v1["error_rate"],
                    "v2_error_rate": v2["error_rate"],
                    "v1_p95_ms": v1["p95_ms"],
                    "v2_p95_ms": v2["p95_ms"],
                })

                if (
                    v1["requests_5m"] < MIN_REQUESTS
                    or v2["requests_5m"] < MIN_REQUESTS
                ):
                    _state["healthy_evaluations"] = 0

                    _record(
                        "HOLD",
                        "Waiting for sufficient v1 and v2 request samples.",
                    )

                else:
                    latency_ratio = (
                        v2["p95_ms"] / v1["p95_ms"]
                        if v1["p95_ms"] > 0
                        else 0
                    )

                    unhealthy = (
                        v2["error_rate"] > MAX_ERROR_RATE
                        or (
                            latency_ratio > 0
                            and latency_ratio > MAX_LATENCY_RATIO
                        )
                    )

                    if unhealthy:
                        await asyncio.to_thread(
                            _apply_weights, 100, 0
                        )

                        _state.update({
                            "v1_weight": 100,
                            "v2_weight": 0,
                            "healthy_evaluations": 0,
                            "next_weight_step": 0,
                        })

                        _record(
                            "ROLLBACK",
                            "v2 breached an error-rate or latency safety threshold. Traffic returned to v1.",
                        )

                        _state["running"] = False

                    else:
                        _state["healthy_evaluations"] += 1

                        if (
                            _state["healthy_evaluations"]
                            < REQUIRED_HEALTHY_EVALUATIONS
                        ):
                            _record(
                                "HOLD",
                                "v2 is healthy. Waiting for another successful evaluation.",
                            )

                        elif _state["v2_weight"] >= 100:
                            _record(
                                "COMPLETE",
                                "v2 reached 100% of configured traffic.",
                            )

                            _state["running"] = False

                        else:
                            step = _calculate_weight_step(
                                v2["requests_5m"],
                                v2["error_rate"],
                                latency_ratio,
                            )

                            next_v2 = min(
                                100,
                                _state["v2_weight"] + step,
                            )

                            next_v1 = 100 - next_v2

                            await asyncio.to_thread(
                                _apply_weights,
                                next_v1,
                                next_v2,
                            )

                            _state.update({
                                "v1_weight": next_v1,
                                "v2_weight": next_v2,
                                "next_weight_step": step,
                                "healthy_evaluations": 0,
                            })

                            _record(
                                "PROMOTE",
                                (
                                    f"v2 passed its health checks. "
                                    f"Traffic increased by {step} "
                                    f"percentage points to {next_v2}%."
                                ),
                            )

            except (
                PrometheusError,
                RuntimeError,
                subprocess.TimeoutExpired,
            ) as exc:
                _record(
                    "ERROR",
                    f"Adaptive evaluation failed: {exc}",
                )
                _state["running"] = False

            if _state["running"]:
                await asyncio.sleep(EVALUATION_SECONDS)

    finally:
        _state["running"] = False


@router.post("/start")
async def start_adaptive(request: StartRequest):
    global _task

    async with _lock:
        if _state["running"]:
            raise HTTPException(
                409,
                "Adaptive Canary is already running",
            )

        if _task and not _task.done():
            _task.cancel()

        initial_v2 = request.initial_v2_weight
        initial_v1 = 100 - initial_v2

        try:
            await asyncio.to_thread(
                _apply_weights,
                initial_v1,
                initial_v2,
            )
        except (
            RuntimeError,
            subprocess.TimeoutExpired,
        ) as exc:
            raise HTTPException(
                502,
                f"Could not update Istio VirtualService: {exc}",
            )

        _state.update({
            "running": True,
            "v1_weight": initial_v1,
            "v2_weight": initial_v2,
            "next_weight_step": 0,
            "healthy_evaluations": 0,
            "decision": "STARTED",
            "reason": (
                "Adaptive Canary started. Waiting for live traffic "
                "and sufficient metrics."
            ),
            "last_evaluated_at": datetime.now(timezone.utc).isoformat(),
            "history": [],
        })

        _task = asyncio.create_task(_evaluate_loop())

        return {
            "message": "Adaptive Canary started",
            "status": _state.copy(),
        }


@router.post("/stop")
async def stop_adaptive():
    global _task

    async with _lock:
        if _state["running"]:
            _state["running"] = False

            if _task and not _task.done():
                _task.cancel()

            _record(
                "STOPPED",
                "Controller stopped. Current Istio weights were left unchanged.",
            )

        return {
            "message": "Adaptive controller stopped",
            "status": _state.copy(),
        }


@router.get("/status")
def adaptive_status():
    return _state.copy()


@router.get("/history")
def adaptive_history():
    return {
        "history": list(_state["history"]),
    }
