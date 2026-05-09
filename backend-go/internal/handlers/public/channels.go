package public

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"snatcher/backendv2/internal/handlers"
	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
)

func normalizePublicProvider(p string) string {
	switch p {
	case "whatsapp":
		return "wa"
	case "telegram":
		return "tg"
	default:
		return p
	}
}

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
		ctx, cancel := context.WithTimeout(r.Context(), 50*time.Second)
		defer cancel()
		entries := handlers.CollectPublicInviteEntries(ctx, st, ch.ID)
		type publicTarget struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`
			Provider  string `json:"provider"`
			Status    string `json:"status"`
			InviteURL string `json:"invite_url,omitempty"`
		}
		outTargets := make([]publicTarget, 0, len(entries))
		for _, e := range entries {
			outTargets = append(outTargets, publicTarget{
				ID:        e.ID,
				Name:      e.Name,
				Provider:  normalizePublicProvider(e.Provider),
				Status:    "ok",
				InviteURL: e.InviteURL,
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
