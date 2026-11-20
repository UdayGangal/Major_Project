from flask import Flask, render_template, jsonify, request
from prometheus_client import Counter, Histogram, Info, generate_latest, CONTENT_TYPE_LATEST
import socket
import time

app = Flask(__name__)
POD_NAME = socket.gethostname()
VERSION = "v2"

REQUESTS = Counter(
    "rolling_demo_http_requests",
    "HTTP requests served by the rolling demo application.",
    ["method", "endpoint", "status", "pod", "version"],
)
REQUEST_DURATION = Histogram(
    "rolling_demo_http_request_duration_seconds",
    "HTTP request duration for the rolling demo application.",
    ["endpoint", "pod", "version"],
)
APPLICATION = Info(
    "rolling_demo_application",
    "Identity of a rolling demo application Pod.",
    ["pod", "version"],
)
APPLICATION.labels(pod=POD_NAME, version=VERSION).info({})


@app.before_request
def start_request_timer():
    request.started_at = time.perf_counter()


@app.after_request
def record_request_metrics(response):
    if request.path != "/metrics":
        labels = {
            "method": request.method,
            "endpoint": request.path,
            "status": str(response.status_code),
            "pod": POD_NAME,
            "version": VERSION,
        }
        REQUESTS.labels(**labels).inc()
        REQUEST_DURATION.labels(
            endpoint=request.path, pod=POD_NAME, version=VERSION
        ).observe(time.perf_counter() - request.started_at)
    return response


@app.route("/")
def home():
    return render_template(
        "v2.html",
        version="Version 2",
        hostname=POD_NAME
    )


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "version": VERSION
    }), 200


@app.route("/version")
def version():
    return jsonify({
        "version": VERSION,
        "pod_name": POD_NAME
    }), 200


@app.route("/metrics")
def metrics():
    return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
