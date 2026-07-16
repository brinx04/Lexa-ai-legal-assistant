# backend/app/core/telemetry.py
#
# OBSERVABILITY — OpenTelemetry distributed tracing
# ─────────────────────────────────────────────────────────────────────────────
# One user action in Lexa touches at least four processes:
#
#   Next.js proxy → FastAPI → Redis/Celery → worker → Gemini/Qdrant/Postgres
#
# Tracing stitches those hops back into a single timeline. Spans are exported
# over OTLP/HTTP to a collector (Jaeger all-in-one in dev; any OTLP-compatible
# backend in prod). Instrumentation covers:
#
#   * FastAPI       — one span per request, with route/status attributes
#   * Celery        — one span per task, linked to the request that queued it
#   * SQLAlchemy    — spans for every DB query
#   * requests      — outbound HTTP calls (Indian Kanoon API, etc.)
#
# All setup is defensive: if the opentelemetry packages are not installed or
# OTEL_ENABLED=false, every function is a no-op and Lexa runs untraced.
# ─────────────────────────────────────────────────────────────────────────────
import logging

from app.core.config import settings

logger = logging.getLogger("lexa.telemetry")

_initialized = False


def _build_provider(service_name: str):
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(
        endpoint=f"{settings.OTEL_EXPORTER_OTLP_ENDPOINT.rstrip('/')}/v1/traces"
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return provider


def setup_api_tracing(app) -> None:
    """Instrument the FastAPI app + its outbound dependencies."""
    global _initialized
    if not settings.OTEL_ENABLED or _initialized:
        return
    try:
        _build_provider("lexa-api")

        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app, excluded_urls="metrics,healthz")
        _instrument_common()
        _initialized = True
        logger.info("[Telemetry] Tracing enabled → %s", settings.OTEL_EXPORTER_OTLP_ENDPOINT)
    except ImportError:
        logger.info("[Telemetry] opentelemetry packages not installed — tracing disabled")
    except Exception as exc:
        logger.warning("[Telemetry] Failed to initialise tracing: %s", exc)


def setup_worker_tracing() -> None:
    """
    Instrument the Celery worker process. Must run inside the worker process
    (wired to Celery's `worker_process_init` signal in celery_app.py) because
    the BatchSpanProcessor's background thread does not survive forking.
    """
    global _initialized
    if not settings.OTEL_ENABLED or _initialized:
        return
    try:
        _build_provider("lexa-worker")

        from opentelemetry.instrumentation.celery import CeleryInstrumentor

        CeleryInstrumentor().instrument()
        _instrument_common()
        _initialized = True
        logger.info("[Telemetry] Worker tracing enabled → %s", settings.OTEL_EXPORTER_OTLP_ENDPOINT)
    except ImportError:
        logger.info("[Telemetry] opentelemetry packages not installed — tracing disabled")
    except Exception as exc:
        logger.warning("[Telemetry] Failed to initialise worker tracing: %s", exc)


def _instrument_common() -> None:
    """Instrumentation shared by the API and the worker."""
    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        from app.core.db import engine

        SQLAlchemyInstrumentor().instrument(engine=engine)
    except Exception:
        pass
    try:
        from opentelemetry.instrumentation.requests import RequestsInstrumentor

        RequestsInstrumentor().instrument()
    except Exception:
        pass
