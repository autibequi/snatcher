package admin

import (
	"encoding/json"
	"net/http"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type AutomationsHandler struct {
	store store.Store
}

func NewAutomationsHandler(st store.Store) *AutomationsHandler {
	return &AutomationsHandler{store: st}
}

// GET /api/automations
// Retorna todos os canais com seu status de automação (registro pode não existir → enabled=false)
func (h *AutomationsHandler) List(w http.ResponseWriter, r *http.Request) {
	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	automations, _ := h.store.ListChannelAutomations(false)
	byChannel := make(map[int64]models.ChannelAutomation, len(automations))
	for _, a := range automations {
		byChannel[a.ChannelID] = a
	}

	type row struct {
		ChannelID   int64                     `json:"channel_id"`
		ChannelName string                    `json:"channel_name"`
		Automation  *models.ChannelAutomation `json:"automation,omitempty"`
	}
	out := make([]row, 0, len(channels))
	for _, c := range channels {
		r := row{ChannelID: c.ID, ChannelName: c.Name}
		if a, ok := byChannel[c.ID]; ok {
			r.Automation = &a
		}
		out = append(out, r)
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /api/automations/{channelId}
func (h *AutomationsHandler) Get(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "channelId")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channelId")
		return
	}
	a, err := h.store.GetChannelAutomation(channelID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	logs, _ := h.store.ListAutoMatchLogsByChannel(channelID, 20)
	writeJSON(w, http.StatusOK, map[string]any{
		"automation": a,
		"logs":       logs,
	})
}

// PUT /api/automations/{channelId}
func (h *AutomationsHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	channelID, ok := pathInt(r, "channelId")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid channelId")
		return
	}
	var a models.ChannelAutomation
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a.ChannelID = channelID
	if a.MatchType == "" {
		a.MatchType = "all"
	}
	if a.CooldownHours <= 0 {
		a.CooldownHours = 6
	}
	if a.DropThreshold == 0 {
		a.DropThreshold = 0.10
	}
	if err := h.store.UpsertChannelAutomation(a); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	saved, _ := h.store.GetChannelAutomation(channelID)
	writeJSON(w, http.StatusOK, saved)
}
