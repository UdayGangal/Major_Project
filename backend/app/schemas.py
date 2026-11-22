from typing import Optional
from pydantic import BaseModel
class StartRunRequest(BaseModel):
    technique: str
    source_version: str = "v1"
    target_version: str = "v2"
    application_url: Optional[str] = None
