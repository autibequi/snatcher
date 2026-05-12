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
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows)
	}
}

// RecentConversionsHandler retorna as N conversões mais recentes com nome do grupo.
// GET /api/admin/conversions/recent?limit=50
func RecentConversionsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 50
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 500 {
			limit = v
		}
		type row struct {
			ID         int64    `db:"id" json:"id"`
			ShortID    string   `db:"short_id" json:"short_id"`
			CatalogID  *int64   `db:"catalog_id" json:"catalog_id,omitempty"`
			GroupName  *string  `db:"group_name" json:"group_name,omitempty"`
			SourceID   string   `db:"source_id" json:"source_id"`
			OrderValue *float64 `db:"order_value" json:"order_value,omitempty"`
			Commission *float64 `db:"commission" json:"commission,omitempty"`
			Currency   string   `db:"currency" json:"currency"`
			Status     string   `db:"status" json:"status"`
			OccurredAt string   `db:"occurred_at" json:"occurred_at"`
		}
		var rows []row
		db.SelectContext(r.Context(), &rows, `
			SELECT c.id, c.short_id, c.catalog_id, g.name AS group_name, c.source_id,
			       c.order_value, c.commission, c.currency, c.status, c.occurred_at::text
			FROM conversions c LEFT JOIN groups g ON g.id=c.group_id
			ORDER BY c.occurred_at DESC LIMIT $1
		`, limit)
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows)
	}
}

// ConversionsByDayHandler retorna conversões agrupadas por dia nos últimos N dias.
// GET /api/admin/conversions/by-day?days=30
func ConversionsByDayHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days := 30
		if v, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && v > 0 && v <= 365 {
			days = v
		}
		type row struct {
			Date       string  `db:"day" json:"date"`
			Count      int64   `db:"n" json:"count"`
			Revenue    float64 `db:"revenue" json:"revenue"`
			Commission float64 `db:"commission" json:"commission"`
		}
		var rows []row
		db.SelectContext(r.Context(), &rows, `
			SELECT occurred_at::date AS day, COUNT(*) AS n,
			       COALESCE(SUM(order_value), 0) AS revenue,
			       COALESCE(SUM(commission), 0) AS commission
			FROM conversions
			WHERE occurred_at > now() - $1 * INTERVAL '1 day'
			GROUP BY day ORDER BY day DESC
		`, days)
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows)
	}
}

// ConversionsBySourceHandler retorna conversões agrupadas por source_id nos últimos N dias.
// GET /api/admin/conversions/by-source?days=30
func ConversionsBySourceHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days := 30
		if v, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && v > 0 && v <= 365 {
			days = v
		}
		type row struct {
			SourceID   string  `db:"source_id" json:"source_id"`
			Count      int64   `db:"n" json:"count"`
			Revenue    float64 `db:"revenue" json:"revenue"`
			Commission float64 `db:"commission" json:"commission"`
		}
		var rows []row
		db.SelectContext(r.Context(), &rows, `
			SELECT source_id, COUNT(*) AS n,
			       COALESCE(SUM(order_value), 0) AS revenue,
			       COALESCE(SUM(commission), 0) AS commission
			FROM conversions
			WHERE occurred_at > now() - $1 * INTERVAL '1 day'
			GROUP BY source_id ORDER BY commission DESC
		`, days)
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows)
	}
}
