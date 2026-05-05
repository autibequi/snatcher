package ws

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Handler é o HTTP handler SSE para /ws.
type Handler struct {
	hub    *Hub
	secret string
}

func NewHandler(hub *Hub, jwtSecret string) *Handler {
	return &Handler{hub: hub, secret: jwtSecret}
}

// ServeHTTP implementa http.Handler para SSE.
// Autentica via ?token=<jwt> (query param — limitação do EventSource/WS browser).
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Autenticar token
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(h.secret), nil
	})
	if err != nil || !tok.Valid {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	// Headers SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // nginx

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// Gerar client ID único
	clientID := fmt.Sprintf("%d-%s", time.Now().UnixNano(), strings.Split(r.RemoteAddr, ":")[0])
	events := h.hub.Register(clientID)
	defer h.hub.Unregister(clientID)

	// Enviar evento de conexão
	fmt.Fprintf(w, "event: connected\ndata: {\"ts\":%d}\n\n", time.Now().UnixMilli())
	flusher.Flush()

	// Ticker para heartbeat
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case event, ok := <-events:
			if !ok {
				return
			}
			data, err := json.Marshal(event)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, data)
			flusher.Flush()
		}
	}
}
