# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.db import engine, Base
from app.core.limiter import limiter  # Singleton — also imported by route files
from app.core.telemetry import setup_api_tracing

# Import our individual routers
from app.api.documents import router as document_router
from app.api.chat import router as chat_router

from app.models.document import Document
from app.models.chat import ChatMessage  # Tells SQLAlchemy to build the chat table

# Initialize SQL tables on boot up
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Core backend engine for legal document analysis"
)

# ──────────────────────────────────────────────────────────────────────────────
# RATE LIMITER
# Wire the limiter singleton into app state so SlowAPI's middleware can read it,
# and register the 429 Too Many Requests exception handler.
# ──────────────────────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ──────────────────────────────────────────────────────────────────────────────
# CORS — Restricted to Next.js dev server only.
# Add your production domain here before deploying.
# ──────────────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Tightened from "*"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# OBSERVABILITY
# /metrics       — Prometheus scrape endpoint (request rate, latency, in-flight)
# OTLP tracing   — spans exported to Jaeger; see app/core/telemetry.py
# Both degrade to no-ops if their packages are not installed.
# ──────────────────────────────────────────────────────────────────────────────
try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator(
        should_group_status_codes=False,
        excluded_handlers=["/metrics", "/healthz"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
except ImportError:
    pass

setup_api_tracing(app)

# Register routers
app.include_router(document_router)
app.include_router(chat_router)


@app.get("/")
async def health_check():
    return {
        "status": "online",
        "message": f"{settings.PROJECT_NAME} Engine is Live! ⚖️"
    }


@app.get("/healthz", include_in_schema=False)
async def liveness_probe():
    """Kubernetes liveness/readiness probe — no auth, no rate limit."""
    return {"status": "ok"}