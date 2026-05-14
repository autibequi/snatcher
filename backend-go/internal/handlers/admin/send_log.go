package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
)

// GET /api/admin/send-log?limit=100&status=sent&group_id=15
// Lista histórico de envios do send_log (disparos que passaram pelo worker).
func SendLogHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 100
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 500 {
			limit = v
		}
		status := r.URL.Query().Get("status")
		groupID := r.URL.Query().Get("group_id")

		type row struct {
			ID          int64    `db:"id"            json:"id"`
			GroupID     int64    `db:"group_id"      json:"group_id"`
			GroupName   *string  `db:"group_name"    json:"group_name,omitempty"`
			AccountID   *int64   `db:"account_id"    json:"account_id,omitempty"`
			Phone       *string  `db:"phone"         json:"phone,omitempty"`
			CatalogID   *int64   `db:"catalog_id"    json:"catalog_id,omitempty"`
			ProductTitle *string `db:"product_title" json:"product_title,omitempty"`
			Status      string   `db:"status"        json:"status"`
			ErrorCode   *string  `db:"error_code"    json:"error_code,omitempty"`
			SentAt      string   `db:"sent_at"       json:"sent_at"`
			// Fonte: 'auto' (Score Engine) ou 'manual' (Composer)
			Source      *string  `db:"source"        json:"source,omitempty"`
		}

		args := []any{limit}
		where := ""
		if status != "" {
			args = append(args, status)
			where += " AND sl.status = $" + strconv.Itoa(len(args))
		}
		if groupID != "" {
			args = append(args, groupID)
			where += " AND sl.group_id = $" + strconv.Itoa(len(args))
		}

		var rows []row
		q := `
			SELECT sl.id, sl.group_id,
			       COALESCE(g.name, g.whatsapp_jid, sl.group_id::text) AS group_name,
			       sl.account_id,
			       a.phone,
			       sl.catalog_id,
			       COALESCE(c.title, 'Produto #' || sl.catalog_id) AS product_title,
			       sl.status,
			       sl.error_code,
			       sl.sent_at::text AS sent_at,
			       sq.source
			FROM send_log sl
			LEFT JOIN groups  g  ON g.id  = sl.group_id
			LEFT JOIN accounts a ON a.id  = sl.account_id
			LEFT JOIN catalog  c ON c.id  = sl.catalog_id
			LEFT JOIN send_queue sq ON sq.id = sl.send_queue_id
			WHERE 1=1` + where + `
			ORDER BY sl.sent_at DESC
			LIMIT $1
		`
		if err := db.SelectContext(r.Context(), &rows, q, args...); err != nil {
			rows = []row{}
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}
