package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
)

// ConversionsByGroupHandler retorna conversões agrupadas por group_id nos últimos N dias.
// GET /api/admin/conversions/by-group?days=7
func ConversionsByGroupHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days := 7
		if d := r.URL.Query().Get("days"); d != "" {
			if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 {
				days = parsed
			}
		}

		type row struct {
			GroupID     *int64  `db:"group_id" json:"group_id"`
			Conversions int64   `db:"n" json:"conversions"`
			Revenue     float64 `db:"revenue" json:"revenue"`
			Commission  float64 `db:"commission" json:"commission"`
		}
		var rows []row
		err := db.SelectContext(r.Context(), &rows, `
			SELECT group_id,
			       COUNT(*) AS n,
			       COALESCE(SUM(order_value), 0) AS revenue,
			       COALESCE(SUM(commission), 0) AS commission
			FROM conversions
			WHERE occurred_at > now() - $1 * INTERVAL '1 day'
			GROUP BY group_id
			ORDER BY commission DESC
		`, days)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rows)
	}
}
