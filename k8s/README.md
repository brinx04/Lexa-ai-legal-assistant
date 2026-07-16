# Lexa on Kubernetes

Production-shaped manifests for the whole stack. Tested against local
clusters (kind / minikube / Docker Desktop).

## Quick start (local cluster)

```bash
# 1. Build images into the cluster's runtime
docker build -t lexa/backend  ./backend
docker build -t lexa/notifier ./notifier
docker build -t lexa/frontend ./frontend
# kind only: kind load docker-image lexa/backend lexa/notifier lexa/frontend

# 2. Create the namespace + config
kubectl apply -f k8s/00-namespace.yaml -f k8s/01-config.yaml

# 3. Secrets — copy the template, fill in real values (never commit it)
cp k8s/02-secrets.example.yaml k8s/02-secrets.yaml
kubectl apply -f k8s/02-secrets.yaml

# 4. Everything else
kubectl apply -f k8s/

# 5. Watch it come up
kubectl -n lexa get pods -w
```

## Layout

| File | What it runs |
| --- | --- |
| `10-postgres.yaml` | Postgres StatefulSet + PVC (swap for RDS/Cloud SQL in prod) |
| `11-redis.yaml` | Redis (Celery broker) |
| `12-qdrant.yaml` | Qdrant vector DB StatefulSet |
| `13-kafka.yaml` | KRaft Kafka + topic-init Job (swap for Strimzi/MSK in prod) |
| `20-api.yaml` | FastAPI ×2, probes on `/healthz`, Prometheus annotations |
| `21-worker.yaml` | Celery workers ×2, graceful 120s drain on rollout |
| `22-notifier.yaml` | Go notifier ×3 — one Kafka consumer group across 3 partitions |
| `23-frontend.yaml` | Next.js ×2 |
| `30-hpa.yaml` | CPU autoscaling for api (2–6) and worker (1–8) |
| `31-ingress.yaml` | NGINX ingress, SSE-safe (buffering off) |

## Production notes

- **State out of the cluster**: replace the Postgres/Kafka/Qdrant StatefulSets
  with managed services; keep only the stateless deployments here.
- **Uploads volume**: `lexa-uploads` needs an RWX storage class across nodes
  (EFS/Azure Files/NFS) — or better, move uploads to S3/GCS.
- **Monitoring**: install `kube-prometheus-stack` via Helm; the api and
  notifier pods already carry `prometheus.io/*` scrape annotations, and the
  Grafana dashboard JSON in `infra/grafana/dashboards/` imports as-is.
- **Tracing**: point `OTEL_EXPORTER_OTLP_ENDPOINT` in `01-config.yaml` at
  your collector (Jaeger, Tempo, or an OpenTelemetry Collector).
