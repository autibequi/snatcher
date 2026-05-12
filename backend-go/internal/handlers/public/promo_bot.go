package public

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

// PromoBotPayload — payload básico de mensagem vinda de grupo de promoção.
type PromoBotPayload struct {
	Event    string `json:"event"`
	Instance string `json:"instance"`
	Data     struct {
		Key struct {
			RemoteJID string `json:"remoteJid"`
			FromMe    bool   `json:"fromMe"`
			ID        string `json:"id"`
		} `json:"key"`
		Message struct {
			Conversation string `json:"conversation"`
		} `json:"message"`
		PushName string `json:"pushName"`
	} `json:"data"`
}

// promoBotThrottleMu protege promoBotLastSeen.
var promoBotThrottleMu sync.Mutex

// promoBotLastSeen é um throttle in-memory simples (futuramente persistir em Redis ou DB).
var promoBotLastSeen = map[string]time.Time{}

// promoBotThrottleAllow retorna true se o usuário pode receber resposta agora.
// Limite: 1 resposta por hora por usuário.
func promoBotThrottleAllow(user string) bool {
	if user == "" {
		return false
	}
	promoBotThrottleMu.Lock()
	defer promoBotThrottleMu.Unlock()
	last, ok := promoBotLastSeen[user]
	if ok && time.Since(last) < time.Hour {
		return false
	}
	promoBotLastSeen[user] = time.Now()
	return true
}

// PromoBotWebhookHandler — STUB: recebe mensagens em grupos de promoção.
// LLM-driven Q&A é trabalho futuro. Por ora, apenas registra e responde com 204.
// db é recebido para uso futuro (persistência de conversas, throttle em DB, etc).
func PromoBotWebhookHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p PromoBotPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		// Ignorar mensagens próprias ou sem texto
		if p.Data.Key.FromMe || p.Data.Message.Conversation == "" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		// Throttle por usuário (max 1 resp/hora)
		if !promoBotThrottleAllow(p.Data.PushName) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		slog.Info("promo_bot.received",
			"from", p.Data.PushName,
			"jid", p.Data.Key.RemoteJID,
			"text", p.Data.Message.Conversation,
		)
		// TODO Fase 8.5: LLM call para responder dúvida + verificar se mensagem é sobre produto recente
		w.WriteHeader(http.StatusNoContent)
	}
}
