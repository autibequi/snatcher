package admin

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/jmoiron/sqlx"
)

// GET /api/admin/suggestions?status=pending
func ListSuggestionsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		if status == "" {
			status = "pending"
		}
		type row struct {
			ID             int64    `db:"id" json:"id"`
			LoopName       string   `db:"loop_name" json:"loop_name"`
			TargetType     string   `db:"target_type" json:"target_type"`
			TargetID       int64    `db:"target_id" json:"target_id"`
			Suggestion     string   `db:"suggestion" json:"suggestion"`
			Reasoning      *string  `db:"reasoning" json:"reasoning,omitempty"`
			ProposedChange []byte   `db:"proposed_change" json:"-"`
			Confidence     *float64 `db:"confidence" json:"confidence,omitempty"`
			CreatedAt      string   `db:"created_at" json:"created_at"`
		}
		var rows []row
		_ = db.SelectContext(r.Context(), &rows, `
			SELECT id, loop_name, target_type, target_id, suggestion, reasoning, proposed_change, confidence, created_at::text
			FROM llm_suggestions
			WHERE status = $1
			ORDER BY created_at DESC LIMIT 200
		`, status)

		// expose proposed_change as raw json
		type wrapped struct {
			*row
			ProposedChange json.RawMessage `json:"proposed_change"`
		}
		out := make([]wrapped, len(rows))
		for i := range rows {
			out[i] = wrapped{row: &rows[i], ProposedChange: json.RawMessage(rows[i].ProposedChange)}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /api/admin/suggestions/{id}/approve
func ApproveSuggestionHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := r.PathValue("id")
		if idStr == "" {
			// fallback: parse from URL path manually
			parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
			for i, p := range parts {
				if p == "suggestions" && i+2 < len(parts) {
					idStr = parts[i+1]
					break
				}
			}
		}
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "bad id", 400)
			return
		}

		var loopName, targetType string
		var targetID int64
		var proposedChange []byte
		if err := db.QueryRowxContext(r.Context(),
			"SELECT loop_name, target_type, target_id, proposed_change FROM llm_suggestions WHERE id=$1 AND status='pending'",
			id).Scan(&loopName, &targetType, &targetID, &proposedChange); err != nil {
			http.Error(w, "not found or already acted", 404)
			return
		}

		// aplica mudança baseado em target_type
		if targetType == "tunable_parameters" {
			var change map[string]any
			_ = json.Unmarshal(proposedChange, &change)
			if pv, ok := change["proposed"].(float64); ok {
				_, _ = db.ExecContext(r.Context(),
					"UPDATE tunable_parameters SET current_value=$1, last_changed=now(), last_change_by='manual_l4' WHERE id=$2",
					pv, targetID)
			}
		}
		if targetType == "groups" {
			var change map[string]any
			_ = json.Unmarshal(proposedChange, &change)
			if pv, ok := change["proposed"].(float64); ok {
				_, _ = db.ExecContext(r.Context(),
					"UPDATE groups SET daily_msg_cap=$1 WHERE id=$2",
					int(pv), targetID)
			}
		}

		_, _ = db.ExecContext(r.Context(),
			"UPDATE llm_suggestions SET status='approved', acted_at=now() WHERE id=$1", id)
		_, _ = db.ExecContext(r.Context(), `
			INSERT INTO llm_actions (loop_name, action_type, target_table, target_id, after_value, reasoning, evaluation, applied_at)
			VALUES ($1, 'applied', $2, $3, $4, 'manual approval via L4 dashboard', 'success', now())
		`, loopName, targetType, targetID, proposedChange)
		slog.Info("suggestion.approved", "id", id, "loop", loopName)
		w.WriteHeader(204)
	}
}

// POST /api/admin/suggestions/{id}/dismiss
func DismissSuggestionHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := r.PathValue("id")
		if idStr == "" {
			parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
			for i, p := range parts {
				if p == "suggestions" && i+2 < len(parts) {
					idStr = parts[i+1]
					break
				}
			}
		}
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, "bad id", 400)
			return
		}
		reason := r.URL.Query().Get("reason")
		_, _ = db.ExecContext(r.Context(),
			"UPDATE llm_suggestions SET status='dismissed', dismissed_reason=$1, acted_at=now() WHERE id=$2 AND status='pending'",
			reason, id)
		w.WriteHeader(204)
	}
}

// POST /api/admin/suggestions/dismiss-all — ignora todas as sugestões pendentes (dashboard).
func DismissAllPendingSuggestionsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		reason := r.URL.Query().Get("reason")
		if reason == "" {
			reason = "dismiss_all_dashboard"
		}
		res, err := db.ExecContext(r.Context(),
			"UPDATE llm_suggestions SET status='dismissed', dismissed_reason=$1, acted_at=now() WHERE status='pending'",
			reason)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		n, _ := res.RowsAffected()
		writeJSON(w, http.StatusOK, map[string]int64{"dismissed": n})
	}
}
