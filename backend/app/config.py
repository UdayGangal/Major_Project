import os
from dotenv import load_dotenv
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/deployment_analytics")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://localhost:9091").rstrip("/")
KUBECTL_BIN = os.getenv("KUBECTL_BIN", "kubectl")
NAMESPACE = os.getenv("KUBERNETES_NAMESPACE", "default")
COLLECTION_INTERVAL = int(os.getenv("COLLECTION_INTERVAL_SECONDS", "5"))
LOG_TAIL = int(os.getenv("LOG_TAIL_LINES", "100"))
CORS_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x.strip()]
TECHNIQUES = {
 "rolling": {"name":"Rolling Update","selector":"app=rolling-demo","deployments":["rolling-demo"],"service":"rolling-demo-service"},
 "recreate": {"name":"Recreate","selector":"app=recreate-demo","deployments":["recreate-demo"],"service":"recreate-demo-service"},
 "blue-green": {"name":"Blue-Green","selector":"app=rolling-demo,version in (blue,green)","deployments":["blue-deployment","green-deployment"],"service":"blue-green-service"}
}
