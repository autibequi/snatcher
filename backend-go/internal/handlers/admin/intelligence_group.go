package admin

import (
	"net/http"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/selection"
)

// GET /api/admin/intelligence/group/{id}
// Explica, para um grupo específico, quais produtos seriam enviados e por quê —
// base do hub Inteligência do front. Usa SelectCandidatesForGroup (A1), a mesma
// função canônica do tick e do dry-run, garantindo paridade de lógica.
//
// Resposta:
//
//	{
//	  "group_id": 16,
//	  "enqueued_top": { ... } | null,
//	  "ranked": [ { "id", "title", "price", ..., "reasons" } ],
//	  "gates": { "in_window", "pacing_ok", "has_channel", "has_modem" }
//	}
func IntelligenceGroupHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		groupID, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "group id inválido")
			return
		}

		// Carrega dados do grupo para obter channel_id e daily_msg_cap.
		var grp struct {
			ID          int64  `db:"id"`
			ChannelID   *int64 `db:"channel_id"`
			DailyMsgCap int    `db:"daily_msg_cap"`
		}
		if err := db.GetContext(ctx, &grp, `
			SELECT id,
			       channel_id,
			       COALESCE(daily_msg_cap, 0) AS daily_msg_cap
			FROM groups
			WHERE id = $1`, groupID); err != nil {
			writeErr(w, http.StatusNotFound, "grupo não encontrado")
			return
		}

		channelID := int64(0)
		if grp.ChannelID != nil {
			channelID = *grp.ChannelID
		}

		ranked, flags, err := selection.SelectCandidatesForGroup(ctx, db, groupID, channelID, grp.DailyMsgCap)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao selecionar candidatos: "+err.Error())
			return
		}

		// Para obter o breakdown de Reasons do match.Score, carregamos o canal
		// aqui (mesmo que SelectCandidatesForGroup já o carregue internamente).
		// match.Score é puro (<1µs), o custo é mínimo.
		var ch models.ChannelV2
		if channelID > 0 && flags.HasChannel {
			_ = db.GetContext(ctx, &ch, `
				SELECT id, name, quality_threshold, daily_cap, active, created_at,
				       price_min, price_max, min_discount_pct
				FROM channels_v2 WHERE id = $1`, channelID)
		}

		// Tipos de resposta.
		type rankedEntry struct {
			ID           int64    `json:"id"`
			Title        string   `json:"title"`
			Price        float64  `json:"price"`
			QualityScore float64  `json:"quality_score"`
			DiscountPct  float64  `json:"discount_pct"`
			Economia     float64  `json:"economia,omitempty"` // economia em R$; omite quando ≤0
			Score        float64  `json:"score"`
			TargetReason string   `json:"target_reason"`
			Reasons      []string `json:"reasons"`
		}

		type enqueuedTop struct {
			ID    int64   `json:"id"`
			Title string  `json:"title"`
			Price float64 `json:"price"`
			Score float64 `json:"score"`
		}

		type gatesInfo struct {
			InWindow  bool `json:"in_window"`
			PacingOK  bool `json:"pacing_ok"`
			HasChannel bool `json:"has_channel"`
			HasModem  bool `json:"has_modem"`
		}

		// Monta ranked[] com breakdown.
		entries := make([]rankedEntry, 0, len(ranked))
		for _, rc := range ranked {
			catID := rc.CategoryID
			scoreRes := match.Score(match.CatalogItem{
				ID:            rc.CatalogID,
				CategoryID:    &catID,
				QualityScore:  rc.QualityScore,
				DiscountPct:   rc.DiscountPct,
				PriceCurrent:  rc.Price,
				PriceOriginal: rc.PriceOriginal,
			}, ch)

			economia := 0.0
			if rc.PriceOriginal > rc.Price && rc.Price > 0 {
				economia = rc.PriceOriginal - rc.Price
			}

			entries = append(entries, rankedEntry{
				ID:           rc.CatalogID,
				Title:        rc.Title,
				Price:        rc.Price,
				QualityScore: rc.QualityScore,
				DiscountPct:  rc.DiscountPct,
				Economia:     economia,
				Score:        rc.Score,
				TargetReason: rc.TargetReason,
				Reasons:      scoreRes.Reasons,
			})
		}

		// enqueued_top: produto que seria enviado no próximo tick (ranked[0]).
		var top *enqueuedTop
		if len(ranked) > 0 {
			t := ranked[0]
			top = &enqueuedTop{
				ID:    t.CatalogID,
				Title: t.Title,
				Price: t.Price,
				Score: t.Score,
			}
		}

		type response struct {
			GroupID     int64        `json:"group_id"`
			EnqueuedTop *enqueuedTop `json:"enqueued_top"`
			Ranked      []rankedEntry `json:"ranked"`
			Gates       gatesInfo    `json:"gates"`
		}

		writeJSON(w, http.StatusOK, response{
			GroupID:     groupID,
			EnqueuedTop: top,
			Ranked:      entries,
			Gates: gatesInfo{
				InWindow:   flags.InWindow,
				PacingOK:   flags.PacingOK,
				HasChannel: flags.HasChannel,
				HasModem:   flags.HasModem,
			},
		})
	}
}
