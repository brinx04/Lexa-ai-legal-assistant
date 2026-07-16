# ── Stage 1: Build a static binary ───────────────────────────────────────────
FROM golang:1.23-alpine AS builder
WORKDIR /src

COPY go.mod ./
COPY *.go ./
# tidy resolves go.sum inside the build so the repo stays lockfile-free
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /notifier .

# ── Stage 2: Minimal runtime (~10 MB image) ───────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget && adduser -D -u 10001 notifier
USER notifier
COPY --from=builder /notifier /usr/local/bin/notifier

EXPOSE 8090
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/healthz || exit 1

ENTRYPOINT ["notifier"]
