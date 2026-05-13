package admin

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/jmoiron/sqlx"
)

type sendersStatusRow struct {
	ID           int64   `db:"id"            json:"id"`
	Slug         string  `db:"slug"          json:"slug"`
	Status       string  `db:"status"        json:"status"`
	PausedUntil  *string `db:"paused_until"  json:"paused_until,omitempty"`
	PausedReason *string `db:"paused_reason" json:"paused_reason,omitempty"`
	QueuePending int     `db:"queue_pending" json:"queue_pending"`
	BansLast24h  int     `db:"bans_24h"      json:"bans_last_24h"`
}

// SendersAccountsHandler retorna todas as contas com métricas por modem.
//
// GET /api/admin/senders/accounts
func SendersAccountsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			ID                  int64   `db:"id"                   json:"id"`
			Phone               string  `db:"phone"                json:"phone"`
			ModemID             int64   `db:"modem_id"             json:"modem_id"`
			ModemSlug           string  `db:"modem_slug"           json:"modem_slug"`
			Status              string  `db:"status"               json:"status"`
			DailySendQuota      int     `db:"daily_send_quota"     json:"daily_send_quota"`
			LastSentAt          *string `db:"last_sent_at"         json:"last_sent_at,omitempty"`
			ConsecutiveFailures int     `db:"consecutive_failures" json:"consecutive_failures"`
			SentToday           int     `db:"sent_today"           json:"sent_today"`
		}
		var rows []row
		_ = db.SelectContext(r.Context(), &rows, `
			SELECT a.id, a.phone, a.modem_id, m.slug AS modem_slug, a.status,
			       a.daily_send_quota, a.last_sent_at::text, a.consecutive_failures,
			       COALESCE((SELECT COUNT(*) FROM send_log sl WHERE sl.account_id=a.id AND sl.sent_at::date = CURRENT_DATE AND sl.status='sent'), 0) AS sent_today
			FROM accounts a JOIN modems m ON m.id=a.modem_id
			ORDER BY a.modem_id, a.id
		`)
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// PauseModemHandler pausa um modem por N horas.
//
// POST /api/admin/modems/:id/pause
func PauseModemHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// extract id from /api/admin/modems/{id}/pause
		path := r.URL.Path
		path = strings.TrimPrefix(path, "/api/admin/modems/")
		path = strings.TrimSuffix(path, "/pause")
		id, err := strconv.ParseInt(path, 10, 64)
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		var body struct {
			Hours  int    `json:"hours"`
			Reason string `json:"reason"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Hours <= 0 {
			body.Hours = 1
		}
		if body.Reason == "" {
			body.Reason = "manual"
		}
		_, _ = db.ExecContext(r.Context(), `
			UPDATE modems SET status='paused', paused_until=now() + $1 * INTERVAL '1 hour', paused_reason=$2 WHERE id=$3
		`, body.Hours, body.Reason, id)
		w.WriteHeader(http.StatusNoContent)
	}
}

// ResumeModemHandler resume um modem pausado.
//
// POST /api/admin/modems/:id/resume
func ResumeModemHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		path = strings.TrimPrefix(path, "/api/admin/modems/")
		path = strings.TrimSuffix(path, "/resume")
		id, err := strconv.ParseInt(path, 10, 64)
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		_, _ = db.ExecContext(r.Context(), `
			UPDATE modems SET status='active', paused_until=NULL, paused_reason=NULL WHERE id=$1
		`, id)
		w.WriteHeader(http.StatusNoContent)
	}
}

// SendersStatusHandler retorna o status operacional de cada modem e sua fila.
//
// GET /api/admin/senders/status
func SendersStatusHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var rows []sendersStatusRow
		err := db.SelectContext(r.Context(), &rows, `
			SELECT
				m.id,
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
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		_ = json.NewEncoder(w).Encode(rows)
	}
}
