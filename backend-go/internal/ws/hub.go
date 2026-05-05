package ws

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	appdb "snatcher/backendv2/internal/db"
)

// Event representa um evento enviado ao cliente.
type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
	TS   int64  `json:"ts"`
}

// Hub gerencia conexões SSE e distribui eventos do Postgres LISTEN/NOTIFY.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]chan Event // chave: client ID
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string]chan Event)}
}

func (h *Hub) Register(clientID string) chan Event {
	ch := make(chan Event, 20)
	h.mu.Lock()
	h.clients[clientID] = ch
	h.mu.Unlock()
	return ch
}

func (h *Hub) Unregister(clientID string) {
	h.mu.Lock()
	if ch, ok := h.clients[clientID]; ok {
		close(ch)
		delete(h.clients, clientID)
	}
	h.mu.Unlock()
}

func (h *Hub) Broadcast(event Event) {
	event.TS = time.Now().UnixMilli()
	h.mu.RLock()
	for _, ch := range h.clients {
		select {
		case ch <- event:
		default: // buffer cheio, drop
		}
	}
	h.mu.RUnlock()
}

// StartListener conecta ao Postgres LISTEN e distribui eventos para o hub.
// Canais subscritos: dispatch.target_updated, crawler.run_completed, account.status_changed, product.new
func (h *Hub) StartListener(ctx context.Context, dsn string) {
	channels := []string{
		"dispatch.target_updated",
		"crawler.run_completed",
		"account.status_changed",
		"product.new",
	}
	for _, ch := range channels {
		ch := ch // captura loop var
		go func() {
			cancel, err := appdb.Listen(ctx, dsn, appdb.ListenConfig{Channel: ch}, func(_, payload string) {
				var data any
				_ = json.Unmarshal([]byte(payload), &data)
				h.Broadcast(Event{Type: ch, Data: data})
			})
			if err != nil {
				return // SQLite ou sem postgres — ignora silenciosamente
			}
			<-ctx.Done()
			cancel()
		}()
	}
}
