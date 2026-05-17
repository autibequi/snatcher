package admin

import (
	"net/http"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/match"
	store "snatcher/backendv2/internal/repositories"
)

// MatchScoreHandler responde POST /api/admin/match/score.
// Body: {"catalog_id": 123, "channel_id": 456}
// Resposta: {"catalog_id": 123, "channel_id": 456, "score": 0.82, "reasons": [...]}
func MatchScoreHandler(st store.Store, db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			CatalogID int64 `json:"catalog_id"`
			ChannelID int64 `json:"channel_id"`
		}
		if err := decodeBody(r, &req); err != nil || req.CatalogID == 0 || req.ChannelID == 0 {
			writeErr(w, http.StatusBadRequest, "catalog_id e channel_id são obrigatórios")
			return
		}

		// Busca produto do catálogo com category_id e quality_score.
		var cat match.CatalogItem
		err := db.QueryRowContext(r.Context(), `
			SELECT id, category_id, COALESCE(quality_score, 0) AS quality_score,
			       COALESCE(discount_pct, 0) AS discount_pct,
			       COALESCE(price_current, 0) AS price_current
			FROM catalog
			WHERE id = $1
		`, req.CatalogID).Scan(&cat.ID, &cat.CategoryID, &cat.QualityScore, &cat.DiscountPct, &cat.PriceCurrent)
		if err != nil {
			writeErr(w, http.StatusNotFound, "produto não encontrado no catálogo")
			return
		}

		// Busca canal.
		ch, err := st.GetChannel(req.ChannelID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "canal não encontrado")
			return
		}

		result := match.Score(cat, ch)

		writeJSON(w, http.StatusOK, map[string]any{
			"catalog_id": req.CatalogID,
			"channel_id": req.ChannelID,
			"score":      result.Score,
			"reasons":    result.Reasons,
		})
	}
}
