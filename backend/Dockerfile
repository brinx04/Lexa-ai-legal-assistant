# Lexa backend image — serves BOTH roles:
#   API:    uvicorn app.main:app          (default CMD)
#   Worker: celery -A celery_app worker   (override command in compose/k8s)
FROM python:3.12-slim

# System deps: tesseract + poppler for the OCR fallback, libpq for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    poppler-utils \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root runtime user; uploads dir must be writable (files are shredded
# after processing, so this is transient scratch space)
RUN useradd -m -u 10001 lexa && mkdir -p /app/uploads && chown -R lexa:lexa /app
USER lexa

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -sf http://127.0.0.1:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
