import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/deployment_analytics",
)
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://localhost:9091").rstrip("/")
KUBECTL_BIN = os.getenv("KUBECTL_BIN", "kubectl")
NAMESPACE = os.getenv("KUBERNETES_NAMESPACE", "default")
COLLECTION_INTERVAL = int(os.getenv("COLLECTION_INTERVAL_SECONDS", "5"))
LOG_TAIL = int(os.getenv("LOG_TAIL_LINES", "100"))
CORS_ORIGINS = [
    x.strip()
    for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if x.strip()
]

TECHNIQUES = {
    "rolling": {
        "name": "Rolling Update",
        "namespace": "default",
        "selector": "app=rolling-demo",
        "deployments": ["rolling-demo"],
        "service": "rolling-demo-service",
        "local_port": 8081,
        "forward_namespace": "default",
        "forward_service": "rolling-demo-service",
        "forward_port": 80,
    },
    "recreate": {
        "name": "Recreate",
        "namespace": "default",
        "selector": "app=recreate-demo",
        "deployments": ["recreate-demo"],
        "service": "recreate-demo-service",
        "local_port": 8082,
        "forward_namespace": "default",
        "forward_service": "recreate-demo-service",
        "forward_port": 80,
    },
    "blue-green": {
        "name": "Blue-Green",
        "namespace": "default",
        "selector": "app=blue-green-demo",
        "deployments": ["blue-deployment", "green-deployment"],
        "service": "blue-green-service",
        "local_port": 8083,
        "forward_namespace": "default",
        "forward_service": "blue-green-service",
        "forward_port": 80,
    },
    "canary": {
        "name": "Canary",
        "namespace": "canary",
        "selector": "app=canary-demo",
        "deployments": ["canary-v1", "canary-v2"],
        "service": "canary-service",
        "local_port": 8084,
        "forward_namespace": "istio-system",
        "forward_service": "istio-ingressgateway",
        "forward_port": 80,
        "health_host": "canary.localhost",
    },
}
