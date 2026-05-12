package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

type sendersStatusRow struct {
	Slug         string  `db:"slug"          json:"slug"`
	Status       string  `db:"status"        json:"status"`
	PausedUntil  *string `db:"paused_until"  json:"paused_until,omitempty"`
	PausedReason *string `db:"paused_reason" json:"paused_reason,omitempty"`
	QueuePending int     `db:"queue_pending" json:"queue_pending"`
	BansLast24h  int     `db:"bans_24h"      json:"bans_last_24h"`
}

// SendersStatusHandler retorna o status operacional de cada modem e sua fila.
//
// GET /api/admin/senders/status
func SendersStatusHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var rows []sendersStatusRow
		err := db.SelectContext(r.Context(), &rows, `
			SELECT
				m.slug,
				m.status,
				m.paused_until::text  AS paused_until,
				m.paused_reason,
				(SELECT COUNT(*) FROM send_queue q WHERE q.modem_id=m.id AND q.status='pending') AS queue_pending,
				(SELECT COUNT(*) FROM ban_events  b WHERE b.modem_id=m.id AND b.detected_at > now()-INTERVAL '24h') AS bans_24h
			FROM modems m
			ORDER BY m.id
		`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []sendersStatusRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}
