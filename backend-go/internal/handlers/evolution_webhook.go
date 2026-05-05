package handlers

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type EvolutionWebhookHandler struct {
	store store.Store
}

func NewEvolutionWebhookHandler(st store.Store) *EvolutionWebhookHandler {
	return &EvolutionWebhookHandler{store: st}
}

// Handle recebe eventos da Evolution API (MESSAGES_UPSERT).
// POST /webhooks/evolution
func (h *EvolutionWebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Event string         `json:"event"`
		Data  json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	if payload.Event != "messages.upsert" && payload.Event != "MESSAGES_UPSERT" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var msgData struct {
		Messages []struct {
			Key struct {
				RemoteJID string `json:"remoteJid"`
				FromMe    bool   `json:"fromMe"`
			} `json:"key"`
			PushName string `json:"pushName"`
			Message  struct {
				Conversation      string `json:"conversation"`
				ExtendedTextMessage *struct {
					Text string `json:"text"`
				} `json:"extendedTextMessage"`
				ImageMessage *struct {
					Caption string `json:"caption"`
					URL     string `json:"url"`
				} `json:"imageMessage"`
			} `json:"message"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(payload.Data, &msgData); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Buscar todos os spies ativos para cruzar com o JID
	spies, err := h.store.ListGroupSpies("", true)
	if err != nil || len(spies) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Indexar spies por remote_group_id
	spyByGroupID := map[string]int64{}
	for _, s := range spies {
		if s.RemoteGroupID.Valid && s.RemoteGroupID.String != "" {
			spyByGroupID[s.RemoteGroupID.String] = s.ID
		}
	}

	for _, msg := range msgData.Messages {
		if msg.Key.FromMe {
			continue
		}
		jid := msg.Key.RemoteJID
		// Grupos WA têm JID no formato xxxxx@g.us
		if !strings.Contains(jid, "@g.us") {
			continue
		}

		spyID, found := spyByGroupID[jid]
		if !found {
			continue
		}

		// Extrair texto
		text := msg.Message.Conversation
		if text == "" && msg.Message.ExtendedTextMessage != nil {
			text = msg.Message.ExtendedTextMessage.Text
		}
		var mediaURL models.NullString
		if msg.Message.ImageMessage != nil {
			if msg.Message.ImageMessage.Caption != "" && text == "" {
				text = msg.Message.ImageMessage.Caption
			}
			if msg.Message.ImageMessage.URL != "" {
				mediaURL = models.NullString{NullString: sql.NullString{String: msg.Message.ImageMessage.URL, Valid: true}}
			}
		}

		if text == "" {
			continue
		}

		m := models.SpyMessage{
			SpyID:    spyID,
			Sender:   msg.PushName,
			Text:     text,
			MediaURL: mediaURL,
		}
		if err := h.store.CreateSpyMessage(m); err != nil {
			slog.Error("evolution webhook: save spy message", "err", err)
		} else {
			slog.Info("evolution webhook: spy message saved", "spy_id", spyID, "sender", msg.PushName)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
