from fastapi import APIRouter
from ..config import TECHNIQUES
router=APIRouter(prefix="/api",tags=["system"])
@router.get("/health")
def health(): return {"status":"ok"}
@router.get("/techniques")
def techniques(): return [{"id":k,"name":v["name"]} for k,v in TECHNIQUES.items()]
