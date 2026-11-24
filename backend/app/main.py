
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import Base, engine
from .routers import (
    system,
    analytics,
    deployments,
    logs,
    history,
    traffic,
    availability,
)
from .services.port_forward_manager import port_forward_manager
from .services.availability_monitor import availability_monitor


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    await port_forward_manager.start()
    await availability_monitor.start()

    try:
        yield
    finally:
        await availability_monitor.stop()
        await port_forward_manager.stop()


app = FastAPI(
    title="Deployment Analytics API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(analytics.router)
app.include_router(deployments.router)
app.include_router(logs.router)
app.include_router(history.router)
app.include_router(traffic.router)
app.include_router(availability.router)
