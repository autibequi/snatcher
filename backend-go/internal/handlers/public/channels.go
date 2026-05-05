package public

import (
	"encoding/json"
	"net/http"

	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
)

type channelSummary struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Slug         any    `json:"slug"`
	TargetsCount int    `json:"targets_count"`
}

// ListChannels devolve os canais ativos (público — sem auth).
func ListChannels(st store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		chs, _ := st.ListChannels()
		out := make([]channelSummary, 0, len(chs))
		for _, c := range chs {
			if !c.Active {
				continue
			}
			targets, _ := st.ListChannelTargets(c.ID)
			var slug any
			if c.Slug.Valid {
				slug = c.Slug.String
			}
			out = append(out, channelSummary{
				ID: c.ID, Name: c.Name, Slug: slug, TargetsCount: len(targets),
			})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}

// GetChannelBySlug devolve um canal + targets ativos (público — sem auth).
// Estrutura usada pelo /api/public/channels/:slug.
func GetChannelBySlug(st store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		ch, err := st.GetChannelBySlug(slug)
		if err != nil {
			http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
			return
		}
		if !ch.Active {
			http.Error(w, `{"error":"channel inactive"}`, http.StatusGone)
			return
		}
		targets, _ := st.ListChannelTargets(ch.ID)
		// Filtrar apenas targets ativos com status válido
		type publicTarget struct {
			ID       int64  `json:"id"`
			Name     string `json:"name"`
			Provider string `json:"provider"`
			Status   string `json:"status"`
		}
		var outTargets []publicTarget
		for _, t := range targets {
			if t.Status != "ok" {
				continue
			}
			name := ""
			if t.Name.Valid {
				name = t.Name.String
			}
			outTargets = append(outTargets, publicTarget{
				ID: t.ID, Name: name, Provider: t.Provider, Status: t.Status,
			})
		}
		var sl any
		if ch.Slug.Valid {
			sl = ch.Slug.String
		}
		out := map[string]any{
			"id":          ch.ID,
			"name":        ch.Name,
			"slug":        sl,
			"description": ch.Description,
			"targets":     outTargets,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
