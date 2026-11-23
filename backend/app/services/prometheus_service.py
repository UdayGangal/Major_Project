import requests

from ..config import PROMETHEUS_URL


class PrometheusError(RuntimeError):
    pass


def query(expression):
    try:
        response = requests.get(
            f"{PROMETHEUS_URL}/api/v1/query",
            params={"query": expression},
            timeout=8,
        )

        response.raise_for_status()
        body = response.json()

    except (requests.RequestException, ValueError) as exc:
        raise PrometheusError(str(exc)) from exc

    if body.get("status") != "success":
        raise PrometheusError(
            body.get("error", "Prometheus query failed")
        )

    return body.get("data", {}).get("result", [])


def scalar(expression):
    result = query(expression)

    if not result:
        return 0.0

    return float(result[0]["value"][1])


def get_analytics(technique):
    selector = f'{{strategy="{technique}"}}'

    request_rate = scalar(
        f"sum(rate(rolling_demo_http_requests_total{selector}[1m]))"
    )

    failed_rate = scalar(
        f"""
        sum(
            rate(
                rolling_demo_http_requests_total
                {{strategy="{technique}",status=~"5.."}}
                [1m]
            )
        )
        """
    )

    total_requests = scalar(
        f"sum(increase(rolling_demo_http_requests_total{selector}[5m]))"
    )

    failed_requests = scalar(
        f"""
        sum(
            increase(
                rolling_demo_http_requests_total
                {{strategy="{technique}",status=~"5.."}}
                [5m]
            )
        )
        """
    )

    average_latency = scalar(
        f"""
        sum(rate(
            rolling_demo_http_request_duration_seconds_sum{selector}[1m]
        ))
        /
        clamp_min(
            sum(rate(
                rolling_demo_http_request_duration_seconds_count{selector}[1m]
            )),
            0.000001
        )
        """
    )

    p95 = scalar(
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
    )

    p99 = scalar(
        f"""
        histogram_quantile(
            0.99,
            sum by (le) (
                rate(
                    rolling_demo_http_request_duration_seconds_bucket
                    {selector}[1m]
                )
            )
        )
        """
    )

    healthy_pods = scalar(f"sum(up{selector})")
    total_pods = scalar(f"count(up{selector})")

    # These infrastructure queries require container metrics to be
    # available in Prometheus and correctly joined to strategy labels.
    cpu = scalar(
        f"""
        sum(
            rate(container_cpu_usage_seconds_total
            {{strategy="{technique}",container!=""}}[1m])
        )
        """
    )

    memory = scalar(
        f"""
        sum(
            container_memory_working_set_bytes
            {{strategy="{technique}",container!=""}}
        )
        """
    )

    return {
        "technique": technique,

        "requests_per_second": request_rate,
        "total_requests": total_requests,
        "failed_requests": failed_requests,

        "error_rate": (
            100.0 * failed_rate / request_rate
            if request_rate > 0 else 0.0
        ),

        "avg_latency_ms": average_latency * 1000,
        "p95_latency_ms": p95 * 1000,
        "p99_latency_ms": p99 * 1000,

        "cpu_cores": cpu,
        "memory_bytes": memory,

        "healthy_pods": int(healthy_pods),
        "total_pods": int(total_pods),
    }