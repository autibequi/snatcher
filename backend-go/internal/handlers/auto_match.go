package handlers

import (
	"encoding/json"
	"net/http"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type AutoMatchHandler struct {
	store store.Store
}

func NewAutoMatchHandler(st store.Store) *AutoMatchHandler {
	return &AutoMatchHandler{store: st}
}

// Status retorna a config atual de auto match + últimos logs.
// GET /api/auto-match
func (h *AutoMatchHandler) Status(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}
	logs, _ := h.store.ListAutoMatchLogs(50)
	if logs == nil {
		logs = []models.AutoMatchLog{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":       cfg.AutoMatchEnabled,
		"threshold":     cfg.AutoMatchThreshold,
		"max_per_run":   cfg.AutoMatchMaxPerRun,
		"logs":          logs,
	})
}

// Toggle habilita/desabilita o auto match.
// POST /api/auto-match/toggle
func (h *AutoMatchHandler) Toggle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled         *bool    `json:"enabled"`
		Threshold       *float64 `json:"threshold"`
		MaxPerRun       *int     `json:"max_per_run"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}

	if req.Enabled != nil {
		cfg.AutoMatchEnabled = *req.Enabled
	}
	if req.Threshold != nil {
		cfg.AutoMatchThreshold = *req.Threshold
	}
	if req.MaxPerRun != nil {
		cfg.AutoMatchMaxPerRun = *req.MaxPerRun
	}

	if err := h.store.UpdateConfig(cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao salvar config")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":     cfg.AutoMatchEnabled,
		"threshold":   cfg.AutoMatchThreshold,
		"max_per_run": cfg.AutoMatchMaxPerRun,
	})
}
