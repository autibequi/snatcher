package admin

import (
	"net/http"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// ChannelTargetConfig é o público-alvo determinístico de um canal (W3 refactor 2026-06).
// Substitui os antigos pesos de bandit. Consumido por internal/services/target.Match.
type ChannelTargetConfig struct {
	Categories []int64  `json:"categories"`
	PriceMin   float64  `json:"price_min"`
	PriceMax   float64  `json:"price_max"`
	Blacklist  []string `json:"blacklist"`
	Whitelist  []string `json:"whitelist"`
}

// GetChannelTargetConfigHandler — GET /api/channels/{id}/target-config.
func GetChannelTargetConfigHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		var cfg ChannelTargetConfig
		err := db.QueryRowContext(r.Context(), `
			SELECT COALESCE(target_categories, '{}'),
			       COALESCE(price_min, 0), COALESCE(price_max, 0),
			       COALESCE(blacklist, '{}'), COALESCE(whitelist, '{}')
			FROM channels_v2 WHERE id = $1`, id).
			Scan(pq.Array(&cfg.Categories), &cfg.PriceMin, &cfg.PriceMax,
				pq.Array(&cfg.Blacklist), pq.Array(&cfg.Whitelist))
		if err != nil {
			writeErr(w, http.StatusNotFound, "canal não encontrado")
			return
		}
		if cfg.Categories == nil {
			cfg.Categories = []int64{}
		}
		if cfg.Blacklist == nil {
			cfg.Blacklist = []string{}
		}
		if cfg.Whitelist == nil {
			cfg.Whitelist = []string{}
		}
		writeJSON(w, http.StatusOK, cfg)
	}
}

// SetChannelTargetConfigHandler — PUT /api/channels/{id}/target-config (substitui tudo).
func SetChannelTargetConfigHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		var cfg ChannelTargetConfig
		if err := decodeBody(r, &cfg); err != nil {
			writeErr(w, http.StatusBadRequest, "json inválido")
			return
		}
		_, err := db.ExecContext(r.Context(), `
			UPDATE channels_v2
			SET target_categories = $1, price_min = $2, price_max = $3,
			    blacklist = $4, whitelist = $5
			WHERE id = $6`,
			pq.Array(cfg.Categories), cfg.PriceMin, cfg.PriceMax,
			pq.Array(cfg.Blacklist), pq.Array(cfg.Whitelist), id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao salvar target-config")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}
