package admin

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// GET /api/admin/send-queue?status=pending&limit=50
// Lista itens da fila de envio (send_queue) com contexto de grupo, produto e modem.
func SendQueueHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status") // "", "pending", "sending", "sent", "failed"
		limit := 50
		if v, err := parseIntQuery(r, "limit", 50); err == nil {
			if v > 0 && v <= 200 {
				limit = v
			}
		}

		where := "1=1"
		args := []any{}
		if status != "" {
			where = "sq.status = $1"
			args = append(args, status)
		}
		args = append(args, limit)
		pLimit := len(args)

		type row struct {
			ID          int64   `db:"id"           json:"id"`
			Status      string  `db:"status"       json:"status"`
			GroupID     int64   `db:"group_id"     json:"group_id"`
			GroupName   string  `db:"group_name"   json:"group_name"`
			ProductID   int64   `db:"product_id"   json:"product_id"`
			ProductTitle string `db:"product_title" json:"product_title"`
			Score       float64 `db:"score"        json:"score"`
			ModemID     *int64  `db:"modem_id"     json:"modem_id,omitempty"`
			ModemName   *string `db:"modem_name"   json:"modem_name,omitempty"`
			EnqueuedAt  string  `db:"enqueued_at"  json:"enqueued_at"`
		}

		var rows []row
		q := `
			SELECT sq.id, sq.status, sq.group_id,
			       COALESCE(g.name, g.jid, sq.group_id::text) AS group_name,
			       sq.catalog_id AS product_id,
			       COALESCE(c.title, 'Produto #' || sq.catalog_id) AS product_title,
			       COALESCE(sq.score, 0) AS score,
			       sq.modem_id,
			       m.name AS modem_name,
			       sq.enqueued_at::text AS enqueued_at
			FROM send_queue sq
			LEFT JOIN groups  g ON g.id  = sq.group_id
			LEFT JOIN catalog c ON c.id  = sq.catalog_id
			LEFT JOIN modems  m ON m.id  = sq.modem_id
			WHERE ` + where + `
			ORDER BY sq.enqueued_at DESC
			LIMIT $` + itoa(pLimit)

		if err := db.SelectContext(r.Context(), &rows, q, args...); err != nil {
			// graceful — send_queue pode não existir
			rows = []row{}
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

func parseIntQuery(r *http.Request, key string, def int) (int, error) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def, nil
	}
	var n int
	_, err := fmt.Sscanf(v, "%d", &n)
	return n, err
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
