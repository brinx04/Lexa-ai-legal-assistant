package main

// SSE hub — fans Kafka events out to connected browsers.
//
// Each connected browser registers a client keyed by the user's email
// (injected server-side by the Next.js proxy as X-User-Email). Events carry
// the owning user's email, so a broadcast only reaches that user's open
// tabs. Events without a user land on every client (system announcements).

import "sync"

const clientBufferSize = 16

type client struct {
	userEmail string
	ch        chan []byte
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
}

func newHub() *Hub {
	return &Hub{clients: make(map[*client]struct{})}
}

func (h *Hub) register(userEmail string) *client {
	c := &client{userEmail: userEmail, ch: make(chan []byte, clientBufferSize)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	sseClients.Inc()
	return c
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	sseClients.Dec()
}

// broadcast delivers the payload to every client owned by userEmail
// (or to everyone when userEmail is empty). Slow clients are skipped
// rather than allowed to block the consumer loop — the frontend treats
// SSE as a change signal and re-fetches state, so a dropped frame only
// delays a refresh, it never loses data.
func (h *Hub) broadcast(userEmail string, payload []byte) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	delivered := 0
	for c := range h.clients {
		if userEmail != "" && c.userEmail != userEmail {
			continue
		}
		select {
		case c.ch <- payload:
			delivered++
		default: // client buffer full — skip instead of blocking
		}
	}
	return delivered
}
