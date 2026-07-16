# backend/celery_app.py
from celery import Celery
from app.core.config import settings

# Initialize Celery using the Redis URL from our configuration
celery_instance = Celery(
    "lexa_workers",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

# FIXED: Call autodiscover_tasks directly on the instance, not on .conf
celery_instance.autodiscover_tasks(["app.workers"])

# General Celery optimizations
celery_instance.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    # Reliability: only ack a task after it finishes, so a worker crash
    # mid-pipeline requeues the document instead of silently losing it.
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


# ──────────────────────────────────────────────────────────────────────────────
# OBSERVABILITY — attach OpenTelemetry inside each worker process.
# worker_process_init fires after forking, which is required because the
# span exporter's background thread cannot be inherited across a fork.
# ──────────────────────────────────────────────────────────────────────────────
from celery.signals import worker_process_init


@worker_process_init.connect(weak=False)
def _init_worker_tracing(**_kwargs):
    from app.core.telemetry import setup_worker_tracing

    setup_worker_tracing()