package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// LoopsStatusHandler implementa GET /api/admin/loops/status.
// Retorna status de autonomia, strikes e ações/sugestões recentes por loop.
func LoopsStatusHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			LoopName        string  `db:"loop_name" json:"loop_name"`
			Status          string  `db:"status" json:"status"`
			Strikes30d      int     `db:"strikes_30d" json:"strikes_30d"`
			LastStrikeAt    *string `db:"last_strike_at" json:"last_strike_at,omitempty"`
			ActionsLast7d   int     `db:"actions_7d" json:"actions_last_7d"`
			SuggestionsOpen int     `db:"suggestions_open" json:"suggestions_open"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, `
			SELECT la.loop_name, la.status, la.strikes_30d, la.last_strike_at::text,
			       (SELECT COUNT(*) FROM llm_actions a WHERE a.loop_name=la.loop_name AND a.applied_at > now()-INTERVAL '7 days') AS actions_7d,
			       (SELECT COUNT(*) FROM llm_suggestions s WHERE s.loop_name=la.loop_name AND s.status='pending') AS suggestions_open
			FROM llm_autonomy la
			ORDER BY la.loop_name
		`); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar status dos loops")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		_ = json.NewEncoder(w).Encode(rows)
	}
}
