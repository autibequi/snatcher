package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
)

// GET /api/admin/audit/timeline?days=7
// Retorna eventos consolidados (llm_actions + system_pauses + ban_events) ordenados por timestamp DESC.
func AuditTimelineHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days := 7
		if v, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && v > 0 && v <= 90 {
			days = v
		}
		type ev struct {
			Type       string  `db:"event_type" json:"event_type"`
			Title      string  `db:"title" json:"title"`
			Detail     string  `db:"detail" json:"detail"`
			Evaluation *string `db:"evaluation" json:"evaluation,omitempty"`
			At         string  `db:"at" json:"at"`
		}
		var rows []ev
		if err := db.SelectContext(r.Context(), &rows, `
			SELECT 'llm_action' AS event_type,
			       loop_name || ':' || action_type AS title,
			       COALESCE(reasoning, target_table || '#' || COALESCE(target_id::text, '?')) AS detail,
			       evaluation,
			       applied_at::text AS at
			FROM llm_actions WHERE applied_at > now() - $1 * INTERVAL '1 day'
			UNION ALL
			SELECT 'system_pause', triggered_by, COALESCE(reasoning, '(no reason)'), NULL, paused_at::text
			FROM system_pauses WHERE paused_at > now() - $1 * INTERVAL '1 day'
			UNION ALL
			SELECT 'ban_event', 'modem_' || modem_id::text, COALESCE(reason, '(unknown)'), NULL, detected_at::text
			FROM ban_events WHERE detected_at > now() - $1 * INTERVAL '1 day'
			ORDER BY at DESC LIMIT 500
		`, days); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if rows == nil {
			rows = []ev{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rows)
	}
}

// GET /api/admin/audit/stats?days=7
func AuditStatsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		days := 7
		if v, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && v > 0 && v <= 90 {
			days = v
		}
		out := map[string]any{}
		var n int
		db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM llm_actions WHERE applied_at > now() - $1 * INTERVAL '1 day'", days)
		out["llm_actions"] = n
		n = 0
		db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM llm_actions WHERE applied_at > now() - $1 * INTERVAL '1 day' AND evaluation='success'", days)
		out["llm_success"] = n
		n = 0
		db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM llm_actions WHERE applied_at > now() - $1 * INTERVAL '1 day' AND evaluation='rollback'", days)
		out["llm_rollback"] = n
		n = 0
		db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM system_pauses WHERE paused_at > now() - $1 * INTERVAL '1 day'", days)
		out["system_pauses"] = n
		n = 0
		db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM ban_events WHERE detected_at > now() - $1 * INTERVAL '1 day'", days)
		out["ban_events"] = n
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}
