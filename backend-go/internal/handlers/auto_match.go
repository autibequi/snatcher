package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"snatcher/backendv2/internal/match"
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

// Preview retorna os produtos que seriam disparados no próximo ciclo.
// GET /api/auto-match/preview
func (h *AutoMatchHandler) Preview(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar config")
		return
	}
	threshold := cfg.AutoMatchThreshold
	if threshold <= 0 { threshold = 50 }
	maxPerRun := cfg.AutoMatchMaxPerRun
	if maxPerRun <= 0 { maxPerRun = 3 }

	products, _ := h.store.ListCatalogProducts(20, 0)
	channels, _ := h.store.ListChannels()

	// Carregar pares recentes para filtrar (mesma lógica do worker)
	recentLogs, _ := h.store.ListAutoMatchLogs(500)
	cutoff := time.Now().Add(-6 * time.Hour)
	type pairKey struct{ pID, cID int64 }
	recentPairs := map[pairKey]bool{}
	for _, l := range recentLogs {
		if l.CreatedAt.After(cutoff) {
			recentPairs[pairKey{l.ProductID, l.ChannelID}] = true
		}
	}

	type previewItem struct {
		ProductName string  `json:"product_name"`
		ChannelName string  `json:"channel_name"`
		Score       float64 `json:"score"`
		AlreadySent bool    `json:"already_sent"`
	}

	var items []previewItem
	sent := 0
	for _, p := range products {
		inp := match.ProductInput{Name: p.CanonicalName}
		if p.Brand.Valid { inp.Brand = p.Brand.String }
		if p.LowestPrice.Valid { inp.Price = p.LowestPrice.Float64 }
		tags := p.GetTags()
		if len(tags) > 0 { inp.Category = tags[0] }

		scores := match.RankChannels(inp, channels)
		for _, s := range scores {
			if s.Value < threshold { break }
			already := recentPairs[pairKey{p.ID, s.ChannelID}]
			items = append(items, previewItem{
				ProductName: p.CanonicalName,
				ChannelName: s.ChannelName,
				Score:       s.Value,
				AlreadySent: already,
			})
			if !already { sent++ }
			if sent >= maxPerRun && !already { break }
		}
		if len(items) >= 30 { break }
	}
	if items == nil { items = []previewItem{} }
	writeJSON(w, http.StatusOK, map[string]any{
		"items":      items,
		"threshold":  threshold,
		"max_per_run": maxPerRun,
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
