from fastapi import APIRouter, HTTPException
from ..config import TECHNIQUES
from ..services.prometheus_service import get_analytics, PrometheusError
from ..services.kubernetes_service import get_pod_status, KubernetesError
router=APIRouter(prefix="/api/analytics",tags=["analytics"])
@router.get("/{technique}/live")
def live(technique:str):
    if technique not in TECHNIQUES: raise HTTPException(404,"Unknown technique")
    try: return get_analytics(technique)
    except PrometheusError as e: raise HTTPException(502,str(e))
@router.get("/{technique}/pods")
def pods(technique:str):
    if technique not in TECHNIQUES: raise HTTPException(404,"Unknown technique")
    try: return {"pods":get_pod_status(technique)}
    except KubernetesError as e: raise HTTPException(502,str(e))
