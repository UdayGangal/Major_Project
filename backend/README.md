# Deployment Analytics Backend

FastAPI backend for the unified deployment analytics dashboard.

## Included
- Live Prometheus queries for Rolling, Recreate and Blue-Green.
- Kubernetes pod status and pod log retrieval using the current kubectl context.
- PostgreSQL records for monitoring runs, sampled metrics, events and logs.
- Backend-side sampling every configured interval while a monitoring run is active.

## Important scope
This backend starts and finishes **monitoring runs only**. It does not deploy, update, delete or roll back Kubernetes workloads. Those controls should be implemented separately with explicit confirmation and narrowly scoped Kubernetes permissions.

## Requirements
Python 3.10+, PostgreSQL, kubectl configured for the target cluster, and Prometheus reachable at PROMETHEUS_URL. Prometheus app metrics must carry `strategy="rolling"`, `strategy="recreate"` or `strategy="blue-green"` labels.

## Windows PowerShell
From this folder:
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```
Edit `.env`, then create the database in PostgreSQL:
```sql
CREATE DATABASE deployment_analytics;
```
Run:
```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
API docs: http://localhost:8000/docs

## API endpoints
- GET /api/health
- GET /api/techniques
- GET /api/analytics/{technique}/live
- GET /api/analytics/{technique}/pods
- POST /api/runs/start  body: {"technique":"rolling"}
- POST /api/runs/{run_id}/finish
- GET /api/logs/{technique}?run_id=<uuid>
- GET /api/history/{technique}
- GET /api/history/run/{run_id}

Valid technique IDs: rolling, recreate, blue-green.

## Prototype limitations
- The collector runs in the API process. Restarting the API interrupts active collection.
- Logs are sampled from the latest N lines and deduplicated by source/message within a run; this is not a lossless log pipeline.
- Collection happens while a monitoring run is active, even if the dashboard tab is closed.
- Kubernetes permissions must allow listing pods and reading pod logs.
