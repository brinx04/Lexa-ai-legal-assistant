package main

// Kafka consumer — the read side of Lexa's event backbone.
//
// Joins the `lexa-notifier` consumer group on the document events topic.
// Consumer-group semantics mean this service scales horizontally: run three
// replicas and Kafka splits the topic's partitions between them; kill one
// and its partitions rebalance to the survivors with no messages lost.
//
// Delivery contract: at-least-once. Offsets are committed only after the
// event has been fanned out, so a crash between fetch and commit replays
// the message — harmless here because the frontend treats events as
// "something changed" signals and re-fetches authoritative state.
//
// Poison messages (unparseable JSON, missing event_type) are routed to the
// dead-letter topic with diagnostic headers instead of wedging the consumer.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"strconv"
	"time"

	"github.com/segmentio/kafka-go"
)

type DocumentEvent struct {
	EventType  string         `json:"event_type"`
	DocumentID string         `json:"document_id"`
	UserEmail  string         `json:"user_email"`
	Filename   string         `json:"filename"`
	Status     string         `json:"status"`
	Metadata   map[string]any `json:"metadata"`
	ProducedAt string         `json:"produced_at"`
}

func runConsumer(ctx context.Context, cfg Config, hub *Hub) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        cfg.KafkaBrokers,
		GroupID:        cfg.KafkaGroupID,
		Topic:          cfg.KafkaTopic,
		MinBytes:       1,
		MaxBytes:       10e6,
		MaxWait:        500 * time.Millisecond,
		StartOffset:    kafka.LastOffset,
		CommitInterval: 0, // synchronous commits — explicit at-least-once
	})
	defer reader.Close()

	dlqWriter := &kafka.Writer{
		Addr:                   kafka.TCP(cfg.KafkaBrokers...),
		Topic:                  cfg.KafkaDLQTopic,
		Balancer:               &kafka.Hash{},
		AllowAutoTopicCreation: true,
	}
	defer dlqWriter.Close()

	// Export consumer lag every 15s so Grafana can alert on a stuck consumer.
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				consumerLag.Set(float64(reader.Stats().Lag))
			}
		}
	}()

	log.Printf("[consumer] joining group %q on topic %q via %v", cfg.KafkaGroupID, cfg.KafkaTopic, cfg.KafkaBrokers)

	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, io.EOF) {
				return
			}
			log.Printf("[consumer] fetch error (broker down?): %v — retrying in 3s", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
			continue
		}

		var evt DocumentEvent
		if err := json.Unmarshal(msg.Value, &evt); err != nil || evt.EventType == "" {
			sendToDLQ(ctx, dlqWriter, msg, err)
		} else {
			eventsConsumed.WithLabelValues(evt.EventType).Inc()
			frame := []byte(fmt.Sprintf("data: %s\n\n", msg.Value))
			delivered := hub.broadcast(evt.UserEmail, frame)
			eventsDelivered.Add(float64(delivered))
			log.Printf("[consumer] %s doc=%s → %d client(s)", evt.EventType, evt.DocumentID, delivered)
		}

		if err := reader.CommitMessages(ctx, msg); err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("[consumer] commit failed: %v", err)
		}
	}
}

func sendToDLQ(ctx context.Context, w *kafka.Writer, original kafka.Message, cause error) {
	dlqMessages.Inc()
	reason := "missing event_type"
	if cause != nil {
		reason = cause.Error()
	}
	log.Printf("[consumer] routing poison message (offset %d) to DLQ: %s", original.Offset, reason)

	dlqMsg := kafka.Message{
		Key:   original.Key,
		Value: original.Value,
		Headers: []kafka.Header{
			{Key: "x-error", Value: []byte(reason)},
			{Key: "x-original-topic", Value: []byte(original.Topic)},
			{Key: "x-original-partition", Value: []byte(strconv.Itoa(original.Partition))},
			{Key: "x-original-offset", Value: []byte(strconv.FormatInt(original.Offset, 10))},
			{Key: "x-failed-at", Value: []byte(time.Now().UTC().Format(time.RFC3339))},
		},
	}

	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := w.WriteMessages(writeCtx, dlqMsg); err != nil {
		log.Printf("[consumer] CRITICAL: DLQ write failed, message dropped: %v", err)
	}
}
