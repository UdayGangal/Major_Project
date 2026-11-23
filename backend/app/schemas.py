from typing import Optional
from pydantic import BaseModel


class StartRunRequest(BaseModel):
    technique: str
    source_version: Optional[str] = None
    target_version: Optional[str] = None
    application_url: Optional[str] = None