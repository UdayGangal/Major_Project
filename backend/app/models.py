import uuid

from sqlalchemy import (
    Column,
    BigInteger,
    String,
    Text,
    Float,
    Integer,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from .database import Base


class DeploymentRun(Base):
    __tablename__ = "deployment_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    run_id = Column(
        UUID(as_uuid=True),
        default=uuid.uuid4,
        unique=True,
        nullable=False,
        index=True,
    )

    technique = Column(String(30), nullable=False, index=True)
    source_version = Column(String(20), default="v1", nullable=False)
    target_version = Column(String(20), default="v2", nullable=False)

    status = Column(String(30), default="running", nullable=False, index=True)

    started_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    completed_at = Column(DateTime(timezone=True))
    application_url = Column(Text)


class MetricSample(Base):
    __tablename__ = "metric_samples"

    __table_args__ = (
        Index("ix_metric_run_sampled", "run_id", "sampled_at"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deployment_runs.run_id", ondelete="CASCADE"),
        nullable=False,
    )

    technique = Column(String(30), nullable=False)

    sampled_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Traffic
    requests_per_second = Column(Float)
    total_requests = Column(Float)
    failed_requests = Column(Float)
    error_rate = Column(Float)

    # Latency
    avg_latency_ms = Column(Float)
    p95_latency_ms = Column(Float)
    p99_latency_ms = Column(Float)

    # Infrastructure
    cpu_cores = Column(Float)
    memory_bytes = Column(Float)

    # Kubernetes availability
    healthy_pods = Column(Integer)
    total_pods = Column(Integer)


class DeploymentEvent(Base):
    __tablename__ = "deployment_events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deployment_runs.run_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event_type = Column(String(60), nullable=False)
    message = Column(Text, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class DeploymentLog(Base):
    __tablename__ = "deployment_logs"

    __table_args__ = (
        UniqueConstraint(
            "run_id",
            "fingerprint",
            name="uq_log_run_fingerprint",
        ),
        Index("ix_log_run_created", "run_id", "created_at"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deployment_runs.run_id", ondelete="CASCADE"),
        nullable=False,
    )

    source = Column(String(255), nullable=False)
    level = Column(String(20), default="INFO", nullable=False)
    message = Column(Text, nullable=False)
    fingerprint = Column(String(64), nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )