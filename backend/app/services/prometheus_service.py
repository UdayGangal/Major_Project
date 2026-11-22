import requests
from ..config import PROMETHEUS_URL

class PrometheusError(RuntimeError): pass

def query(expr):
    try:
        r = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": expr}, timeout=8)
        r.raise_for_status()
        body = r.json()
    except (requests.RequestException, ValueError) as e:
        raise PrometheusError(str(e)) from e
    if body.get("status") != "success":
        raise PrometheusError(body.get("error", "Prometheus query failed"))
    return body.get("data", {}).get("result", [])

def scalar(expr):
    result = query(expr)
    return float(result[0]["value"][1]) if result else 0.0

def get_analytics(technique):
    sel = f'{{strategy="{technique}"}}'
    total = scalar(f"sum(rate(rolling_demo_http_requests_total{sel}[1m]))")
    errors = scalar(f'sum(rate(rolling_demo_http_requests_total{{strategy="{technique}",status=~"5.."}}[1m]))')
    p95 = scalar(f"histogram_quantile(0.95,sum by (le)(rate(rolling_demo_http_request_duration_seconds_bucket{sel}[1m])))")
    return {
      "technique": technique,
      "healthy_pods": int(scalar(f"sum(up{sel})")),
      "total_pods": int(scalar(f"count(up{sel})")),
      "requests_per_second": total,
      "error_rate": (100.0 * errors / total) if total > 0 else 0.0,
      "p95_latency_ms": p95 * 1000.0
    }
