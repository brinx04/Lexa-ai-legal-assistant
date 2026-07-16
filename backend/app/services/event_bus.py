# backend/app/services/event_bus.py
#
# EVENT BUS — Kafka producer for document lifecycle events
# ─────────────────────────────────────────────────────────────────────────────
# Every state transition of a document (uploaded → processing → completed /
# failed) is published as a JSON event to the `lexa.document.events` topic.
# Downstream consumers (the Go notifier service, analytics jobs, audit log
# writers) subscribe independently — the API and worker never know or care
# who is listening. That decoupling is the whole point of the event bus.
#
# Design notes:
#   * Messages are keyed by document_id, so all events for one document land
#     on the same partition and are consumed strictly in order.
#   * The producer is deliberately fire-and-forget with a bounded flush: a
#     broker outage must never take the upload API or Celery pipeline down
#     with it. Events that cannot be delivered are logged and dropped here;
#     consumer-side failures go to the dead-letter topic instead.
#   * `confluent_kafka` is an optional dependency — if it isn't installed
#     (or KAFKA_ENABLED=false), every publish becomes a silent no-op so the
#     project still runs as a plain Celery/Redis app.
# ─────────────────────────────────────────────────────────────────────────────
import atexit
import json
import logging
import socket
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger("lexa.event_bus")

try:
    from confluent_kafka import Producer  # type: ignore

    _KAFKA_AVAILABLE = True
except ImportError:  # pragma: no cover — environment without confluent-kafka
    Producer = None  # type: ignore
    _KAFKA_AVAILABLE = False


# ── Event type constants (single source of truth for producers & consumers) ──
class DocumentEvent:
    UPLOADED = "document.uploaded"
    PROCESSING_STARTED = "document.processing.started"
    PROCESSING_COMPLETED = "document.processing.completed"
    PROCESSING_FAILED = "document.processing.failed"
    DELETED = "document.deleted"


_producer: Optional["Producer"] = None


def _get_producer() -> Optional["Producer"]:
    """Lazily construct a singleton producer. Returns None when disabled."""
    global _producer
    if not (_KAFKA_AVAILABLE and settings.KAFKA_ENABLED):
        return None
    if _producer is None:
        _producer = Producer(
            {
                "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
                "client.id": f"lexa-{socket.gethostname()}",
                # Fail fast instead of blocking API requests on a dead broker
                "message.timeout.ms": 5000,
                "socket.timeout.ms": 3000,
                # Durability: wait for all in-sync replicas, retry idempotently
                "acks": "all",
                "enable.idempotence": True,
            }
        )
        atexit.register(lambda: _producer.flush(2) if _producer else None)
    return _producer


def _delivery_report(err, msg) -> None:
    if err is not None:
        logger.warning("[EventBus] Delivery failed for key=%s: %s", msg.key(), err)


def publish_document_event(
    event_type: str,
    document_id: str,
    user_email: Optional[str] = None,
    filename: Optional[str] = None,
    status: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """
    Publish a document lifecycle event. Never raises — a broken event bus
    must not break the request path or the worker pipeline.
    """
    producer = _get_producer()
    if producer is None:
        return

    event = {
        "event_type": event_type,
        "document_id": str(document_id),
        "user_email": user_email,
        "filename": filename,
        "status": status,
        "metadata": metadata or {},
        "produced_at": datetime.now(timezone.utc).isoformat(),
        "producer": "lexa-backend",
        "schema_version": 1,
    }

    try:
        producer.produce(
            topic=settings.KAFKA_EVENTS_TOPIC,
            key=str(document_id).encode("utf-8"),
            value=json.dumps(event).encode("utf-8"),
            on_delivery=_delivery_report,
        )
        # Serve delivery callbacks without blocking (0 = non-blocking poll)
        producer.poll(0)
    except BufferError:
        # Local queue is full (broker unreachable for a while) — drop & log
        logger.warning("[EventBus] Producer queue full, dropping event %s", event_type)
    except Exception as exc:
        logger.warning("[EventBus] Failed to publish %s: %s", event_type, exc)
