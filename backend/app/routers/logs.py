from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..config import TECHNIQUES
from ..models import DeploymentLog
from ..services.kubernetes_service import get_pod_logs, KubernetesError
router=APIRouter(prefix="/api/logs",tags=["logs"])
@router.get("/{technique}")
def logs(technique:str,run_id:UUID|None=None,limit:int=200,db:Session=Depends(get_db)):
    if technique not in TECHNIQUES: raise HTTPException(404,"Unknown technique")
    limit=min(max(limit,1),1000)
    if run_id:
        rows=db.query(DeploymentLog).filter_by(run_id=run_id).order_by(DeploymentLog.created_at.desc()).limit(limit).all()
        return {"logs":[{"source":x.source,"level":x.level,"message":x.message,"created_at":x.created_at} for x in reversed(rows)]}
    try: return {"logs":get_pod_logs(technique)}
    except KubernetesError as e: raise HTTPException(502,str(e))
