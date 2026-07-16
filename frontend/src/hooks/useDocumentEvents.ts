"use client";

// useDocumentEvents — real-time document lifecycle updates.
//
// Primary path:  EventSource → /api/events → Go notifier → Kafka.
// Fallback path: if the SSE stream can't be established (notifier or Kafka
// down), degrade to slow polling so the app keeps working end-to-end.
//
// The stream is treated as a *change signal*, not a source of truth: on any
// event we invoke `onEvent`, and the caller re-fetches authoritative state
// from the API. This makes duplicate/replayed Kafka messages harmless
// (at-least-once delivery friendly).

import { useEffect, useRef, useState } from "react";

export interface DocumentEvent {
  event_type: string;
  document_id: string;
  user_email?: string;
  filename?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  produced_at?: string;
}

type Transport = "connecting" | "live" | "polling";

const POLL_INTERVAL_MS = 10_000;
const SSE_RETRY_MS = 30_000;

export function useDocumentEvents(onEvent: (evt: DocumentEvent | null) => void) {
  const [transport, setTransport] = useState<Transport>("connecting");
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const startPolling = () => {
      if (pollTimer || disposed) return;
      setTransport("polling");
      pollTimer = setInterval(() => onEventRef.current(null), POLL_INTERVAL_MS);
      // Periodically try to upgrade back to SSE
      retryTimer = setTimeout(() => {
        if (disposed) return;
        stopPolling();
        connect();
      }, SSE_RETRY_MS);
    };

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimer) clearTimeout(retryTimer);
      pollTimer = null;
      retryTimer = null;
    };

    const connect = () => {
      if (disposed) return;
      setTransport("connecting");
      source = new EventSource("/api/events");

      source.onopen = () => {
        if (disposed) return;
        setTransport("live");
        // Catch up on anything missed while disconnected
        onEventRef.current(null);
      };

      source.onmessage = (e) => {
        try {
          onEventRef.current(JSON.parse(e.data) as DocumentEvent);
        } catch {
          onEventRef.current(null);
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;
        startPolling();
      };
    };

    connect();

    return () => {
      disposed = true;
      source?.close();
      stopPolling();
    };
  }, []);

  return { transport };
}
