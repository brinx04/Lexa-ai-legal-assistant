package main

// Prometheus metrics for the notifier. Scraped at GET /metrics by the
// Prometheus container (see infra/prometheus/prometheus.yml) and visualised
// in the provisioned Grafana dashboard.

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	eventsConsumed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "lexa_notifier_events_consumed_total",
		Help: "Kafka events consumed from the document events topic, by event type.",
	}, []string{"event_type"})

	eventsDelivered = promauto.NewCounter(prometheus.CounterOpts{
		Name: "lexa_notifier_events_delivered_total",
		Help: "Events fanned out to connected SSE clients.",
	})

	dlqMessages = promauto.NewCounter(prometheus.CounterOpts{
		Name: "lexa_notifier_dlq_messages_total",
		Help: "Malformed or unprocessable messages routed to the dead-letter topic.",
	})

	sseClients = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "lexa_notifier_sse_clients",
		Help: "Currently connected SSE clients.",
	})

	consumerLag = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "lexa_notifier_kafka_consumer_lag",
		Help: "Messages behind the head of the partition (from kafka-go reader stats).",
	})
)
