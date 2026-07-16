// Lexa Notifier — real-time notification microservice.
//
// Consumes document lifecycle events from Kafka and pushes them to the
// user's browser over Server-Sent Events, replacing frontend polling.
//
//	FastAPI / Celery ──produce──▶ Kafka (lexa.document.events)
//	                                 │ consumer group: lexa-notifier
//	                                 ▼
//	                            this service ──SSE──▶ Next.js proxy ──▶ browser
//
// Endpoints:
//
//	GET /events/stream — SSE stream, identity via X-User-Email header
//	GET /healthz       — liveness/readiness probe
//	GET /metrics       — Prometheus metrics
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Config struct {
	Port          string
	KafkaBrokers  []string
	KafkaTopic    string
	KafkaDLQTopic string
	KafkaGroupID  string
}

func loadConfig() Config {
	return Config{
		Port:          envOr("PORT", "8090"),
		KafkaBrokers:  strings.Split(envOr("KAFKA_BOOTSTRAP_SERVERS", "localhost:9094"), ","),
		KafkaTopic:    envOr("KAFKA_EVENTS_TOPIC", "lexa.document.events"),
		KafkaDLQTopic: envOr("KAFKA_DLQ_TOPIC", "lexa.document.events.dlq"),
		KafkaGroupID:  envOr("KAFKA_GROUP_ID", "lexa-notifier"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func sseHandler(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}

		// Identity comes from the Next.js proxy (server-side header).
		// The ?user= query param is a dev-only fallback for curl testing.
		user := r.Header.Get("X-User-Email")
		if user == "" {
			user = r.URL.Query().Get("user")
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no") // disable proxy buffering

		c := hub.register(user)
		defer hub.unregister(c)

		fmt.Fprint(w, ": connected\n\n")
		flusher.Flush()

		// Heartbeat comments keep idle connections alive through proxies
		// and let the browser detect a dead connection quickly.
		heartbeat := time.NewTicker(15 * time.Second)
		defer heartbeat.Stop()

		for {
			select {
			case <-r.Context().Done():
				return
			case frame := <-c.ch:
				w.Write(frame)
				flusher.Flush()
			case <-heartbeat.C:
				fmt.Fprintf(w, ": heartbeat %d\n\n", time.Now().Unix())
				flusher.Flush()
			}
		}
	}
}

func main() {
	cfg := loadConfig()
	hub := newHub()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go runConsumer(ctx, cfg, hub)

	mux := http.NewServeMux()
	mux.HandleFunc("/events/stream", sseHandler(hub))
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		// No WriteTimeout: SSE connections are intentionally long-lived.
	}

	go func() {
		<-ctx.Done()
		log.Println("[notifier] shutting down...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdownCtx)
	}()

	log.Printf("[notifier] listening on :%s (brokers=%v topic=%s)", cfg.Port, cfg.KafkaBrokers, cfg.KafkaTopic)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[notifier] server error: %v", err)
	}
}
