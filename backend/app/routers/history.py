from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..config import TECHNIQUES
from ..models import DeploymentRun, MetricSample, DeploymentEvent, DeploymentLog
router=APIRouter(prefix="/api/history",tags=["history"])
@router.get("/{technique}")
def history(technique:str,limit:int=50,db:Session=Depends(get_db)):
    if technique not in TECHNIQUES: raise HTTPException(404,"Unknown technique")
    rows=db.query(DeploymentRun).filter_by(technique=technique).order_by(DeploymentRun.started_at.desc()).limit(min(max(limit,1),200)).all()
    return [{"run_id":str(r.run_id),"technique":r.technique,"status":r.status,"started_at":r.started_at,"completed_at":r.completed_at,"application_url":r.application_url} for r in rows]
@router.get("/run/{run_id}")
def run_details(run_id:UUID,db:Session=Depends(get_db)):
    run=db.query(DeploymentRun).filter_by(run_id=run_id).first()
    if not run: raise HTTPException(404,"Run not found")
    samples=db.query(MetricSample).filter_by(run_id=run_id).order_by(MetricSample.sampled_at.asc()).all()
    events=db.query(DeploymentEvent).filter_by(run_id=run_id).order_by(DeploymentEvent.created_at.asc()).all()
    logs=db.query(DeploymentLog).filter_by(run_id=run_id).order_by(DeploymentLog.created_at.asc()).limit(1000).all()
    return {"run":{"run_id":str(run.run_id),"technique":run.technique,"status":run.status,"started_at":run.started_at,"completed_at":run.completed_at,"application_url":run.application_url},
      "samples":[{"sampled_at":x.sampled_at,"requests_per_second":x.requests_per_second,"error_rate":x.error_rate,"p95_latency_ms":x.p95_latency_ms,"healthy_pods":x.healthy_pods,"total_pods":x.total_pods} for x in samples],
      "events":[{"event_type":x.event_type,"message":x.message,"created_at":x.created_at} for x in events],
      "logs":[{"source":x.source,"level":x.level,"message":x.message,"created_at":x.created_at} for x in logs]}
