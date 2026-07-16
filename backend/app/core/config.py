from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import computed_field

# Resolve the project root .env regardless of CWD
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"  # backend/app/core/config.py -> 3 levels up -> project root

class Settings(BaseSettings):
    PROJECT_NAME: str = "Lexa API"
    VERSION: str = "1.0.0"

    # Individual credentials (loaded from root .env)
    POSTGRES_USER: str = "lexa_admin"
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str = "lexa_db"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5433

    REDIS_PASSWORD: str
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6380

    QDRANT_URL: str = "http://localhost:6335"

    # NEW: Free Tier Gemini AI API Key Configuration
    GEMINI_API_KEY: str
    LEXA_SECRET_API_KEY: str = "default_unsafe_key"

    # API Integrations — set in .env, never hardcode credentials here
    KANOON_API_TOKEN: str = ""

    # ── Event streaming (Kafka) ──────────────────────────────────────────
    KAFKA_ENABLED: bool = True
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9094"
    KAFKA_EVENTS_TOPIC: str = "lexa.document.events"
    KAFKA_DLQ_TOPIC: str = "lexa.document.events.dlq"

    # ── Observability (OpenTelemetry → Jaeger, Prometheus) ───────────────
    OTEL_ENABLED: bool = True
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4318"

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @computed_field
    @property
    def REDIS_URL(self) -> str:
        return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    model_config = {"case_sensitive": True, "env_file": str(_ENV_FILE)}

settings = Settings()