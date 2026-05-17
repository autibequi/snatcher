package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
)

// RejectionSummaryRow resume rejeições agrupadas por reason nos últimos 7 dias.
type RejectionSummaryRow struct {
	Reason string `db:"reason" json:"reason"`
	Count  int    `db:"n"      json:"count"`
	Last   string `db:"last"   json:"last"`
}

// RejectionDetailRow representa uma rejeição individual para drill-down.
type RejectionDetailRow struct {
	ID         int64  `db:"id"          json:"id"`
	CatalogID  int64  `db:"catalog_id"  json:"catalog_id"`
	ChannelID  int64  `db:"channel_id"  json:"channel_id"`
	Reason     string `db:"reason"      json:"reason"`
	RejectedAt string `db:"rejected_at" json:"rejected_at"`
	Payload    string `db:"payload"     json:"payload"`
}

// fetchRejectionSummary retorna rejeições agrupadas por reason nos últimos 7 dias.
func fetchRejectionSummary(r *http.Request, db *sqlx.DB) ([]RejectionSummaryRow, error) {
	var rows []RejectionSummaryRow
	err := db.SelectContext(r.Context(), &rows, `
		SELECT reason, COUNT(*) AS n, MAX(rejected_at)::text AS last
		FROM dispatch_rejections
		WHERE rejected_at > now() - interval '7 days'
		GROUP BY reason
		ORDER BY n DESC
	`)
	return rows, err
}

// fetchRejectionDetail retorna rejeições individuais filtradas por reason com limit.
func fetchRejectionDetail(r *http.Request, db *sqlx.DB, reason string, limit int) ([]RejectionDetailRow, error) {
	var rows []RejectionDetailRow
	err := db.SelectContext(r.Context(), &rows, `
		SELECT id, catalog_id, channel_id, reason, rejected_at::text AS rejected_at, payload::text AS payload
		FROM dispatch_rejections
		WHERE reason = $1
		ORDER BY rejected_at DESC
		LIMIT $2
	`, reason, limit)
	return rows, err
}

// ListDispatchRejectionsHandler implementa GET /api/admin/dispatch/rejections.
// Sem ?reason → sumário agrupado por reason (últimos 7 dias).
// Com ?reason=X → detalhe das rejeições daquele reason (limit padrão 100).
func ListDispatchRejectionsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		reason := r.URL.Query().Get("reason")

		limit := 100
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 500 {
			limit = v
		}

		w.Header().Set("Content-Type", "application/json")

		if reason == "" {
			// Modo sumário: agrupado por reason.
			rows, err := fetchRejectionSummary(r, db)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "erro ao buscar rejeições: "+err.Error())
				return
			}
			if rows == nil {
				rows = []RejectionSummaryRow{}
			}
			_ = json.NewEncoder(w).Encode(rows)
			return
		}

		// Modo detalhe: filtrado pelo reason informado.
		rows, err := fetchRejectionDetail(r, db, reason, limit)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar rejeições: "+err.Error())
			return
		}
		if rows == nil {
			rows = []RejectionDetailRow{}
		}
		_ = json.NewEncoder(w).Encode(rows)
	}
}
