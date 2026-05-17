package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// GET /api/channels/:id/candidates?limit=20
// Lista produtos do catálogo com score calculado para o canal.
// Inclui produtos abaixo do threshold (com flag below_threshold) para debug.
// Score usa: quality, channel_weight, freshness — sem sinais de grupo específico.
func ChannelCandidatesHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		limit := 20
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 100 {
			limit = v
		}

		type candidate struct {
			ID             int64    `db:"id"               json:"id"`
			Title          string   `db:"title"            json:"title"`
			ImageURL       *string  `db:"image_url"        json:"image_url,omitempty"`
			SourceID       string   `db:"source_id"        json:"source_id"`
			CategoryName   *string  `db:"category_name"    json:"category_name,omitempty"`
			PriceCurrent   float64  `db:"price_current"    json:"price_current"`
			DiscountPct    *float64 `db:"discount_pct"     json:"discount_pct,omitempty"`
			QualityScore   float64  `db:"quality_score"    json:"quality_score"`
			ChannelWeight  float64  `db:"channel_weight"   json:"channel_weight"`   // 0-100
			FreshnessScore float64  `db:"freshness_score"  json:"freshness_score"`
			CompositeScore float64  `db:"composite_score"  json:"composite_score"`
			BelowThreshold bool     `db:"below_threshold"  json:"below_threshold"`
			SendReady      bool     `db:"send_ready"       json:"send_ready"`
			CatalogStatus  *string  `db:"catalog_status"   json:"catalog_status,omitempty"`
			URLAlive       bool     `db:"url_alive"        json:"url_alive"`
		}

		var rows []candidate
		err = db.SelectContext(r.Context(), &rows, `
			SELECT c.id,
			       c.title,
			       c.image_url,
			       c.source_id,
			       cat.display_name AS category_name,
			       c.price_current,
			       c.discount_pct,
			       COALESCE(c.quality_score, 0) AS quality_score,
			       COALESCE(ccw.weight, 0)       AS channel_weight,
			       exp(-0.693
			           * EXTRACT(EPOCH FROM (now() - COALESCE(c.send_ready_at, c.created_at)))
			           / 3600.0
			           / GREATEST(COALESCE(get_param('half_life_freshness','global',NULL), 7.0) * 24.0, 1.0)
			       )                              AS freshness_score,
			       -- Score composto simplificado (sem sinais de grupo)
			       COALESCE(c.quality_score, 0) * COALESCE(get_param('score_weight_quality','global',NULL), 0.30)
			       + COALESCE(ccw.weight, 0) / 100.0 * COALESCE(get_param('score_weight_channel','global',NULL), 0.15)
			       + exp(-0.693
			             * EXTRACT(EPOCH FROM (now() - COALESCE(c.send_ready_at, c.created_at)))
			             / 3600.0
			             / GREATEST(COALESCE(get_param('half_life_freshness','global',NULL), 7.0) * 24.0, 1.0)
			           ) * COALESCE(get_param('score_weight_freshness','global',NULL), 0.05)
			         AS composite_score,
			       -- below_threshold = composite_score abaixo do threshold.
			       -- quality_score está OK (≥ threshold) mas o composite pode ser baixo
			       -- porque o canal não tem sliders configurados (Canal%=0).
			       -- O operador vê isso como "este produto não seria competitivo neste canal".
			       (
			           COALESCE(c.quality_score, 0) * COALESCE(get_param('score_weight_quality','global',NULL), 0.30)
			           + COALESCE(ccw.weight, 0) / 100.0 * COALESCE(get_param('score_weight_channel','global',NULL), 0.15)
			           + exp(-0.693
			                 * EXTRACT(EPOCH FROM (now() - COALESCE(c.send_ready_at, c.created_at)))
			                 / 3600.0
			                 / GREATEST(COALESCE(get_param('half_life_freshness','global',NULL), 7.0) * 24.0, 1.0)
			               ) * COALESCE(get_param('score_weight_freshness','global',NULL), 0.05)
			       ) < COALESCE(get_param('quality_threshold','global',NULL), 0.4)
			         AS below_threshold,
			       c.send_ready,
			       c.catalog_status,
			       c.canonical_url_alive AS url_alive
			FROM catalog c
			LEFT JOIN channel_category_weights ccw
			       ON ccw.channel_id  = $1
			      AND ccw.category_id = c.category_id
			LEFT JOIN categories cat ON cat.id = c.category_id
			WHERE c.quality_score IS NOT NULL
			ORDER BY composite_score DESC, quality_score DESC
			LIMIT $2
		`, channelID, limit)
		if err != nil {
			rows = []candidate{}
		}
		if rows == nil {
			rows = []candidate{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}
