from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import CORS_ORIGINS
from .database import Base, engine
from .routers import system, analytics, deployments, logs, history
@asynccontextmanager
async def lifespan(app:FastAPI):
    Base.metadata.create_all(bind=engine)
    yield
app=FastAPI(title="Deployment Analytics API",version="1.0.0",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=CORS_ORIGINS,allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
app.include_router(system.router)
app.include_router(analytics.router)
app.include_router(deployments.router)
app.include_router(logs.router)
app.include_router(history.router)
