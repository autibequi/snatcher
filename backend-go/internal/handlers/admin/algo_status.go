package admin

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/algo"
)

// POST /api/admin/algo/toggle
// Alterna use_algo_tick entre 0 e 1. Body: {"enabled": true|false}
func AlgoToggleHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Enabled bool `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "json inválido")
			return
		}
		val := 0.0
		if body.Enabled {
			val = 1.0
		}
		if _, err := db.ExecContext(r.Context(), `
			UPDATE tunable_parameters
			SET current_value=$1, last_changed=now(), last_change_by='dashboard_toggle'
			WHERE param_name='use_algo_tick' AND scope_type='global' AND scope_id IS NULL
		`, val); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar flag")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// GET /api/admin/algo/status
// Retorna estado atual do Score Engine para o widget do dashboard.
//
// Possíveis valores de "state":
//   - "disabled"  — use_algo_tick = 0
//   - "paused"    — flag ON mas fora da janela de envio (21h-6h SP)
//   - "error"     — último tick registrou erro
//   - "ok"        — saudável, aguardando próximo tick
func AlgoStatusHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type resp struct {
			State           string     `json:"state"`    // disabled|paused|error|ok
			LastTickAt      *time.Time `json:"last_tick_at"`
			LastEnqueued    *int       `json:"last_enqueued"`
			LastError       *string    `json:"last_error"`
			TickDurationMs  *int       `json:"tick_duration_ms"`
			InSendWindow    bool       `json:"in_send_window"`
			UseAlgoTick     bool       `json:"use_algo_tick"`
			NextTickSeconds int        `json:"next_tick_seconds"` // segundos até próximo tick (cron */5)
		}

		// Lê flag use_algo_tick.
		var flagVal float64
		_ = db.QueryRowContext(r.Context(),
			`SELECT COALESCE(get_param('use_algo_tick','global',NULL), 0)`).Scan(&flagVal)
		enabled := flagVal != 0
		inWindow := algo.InSendWindow(r.Context(), db)

		// Calcula segundos até próximo tick (cron */5 * * * *).
		now := time.Now()
		nextMin := ((now.Minute()/5)+1)*5
		nextTick := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), nextMin%60, 0, 0, now.Location())
		if nextMin >= 60 {
			nextTick = nextTick.Add(time.Hour)
		}
		nextSecs := int(time.Until(nextTick).Seconds())
		if nextSecs < 0 {
			nextSecs = 0
		}

		// Lê último resultado do tick.
		st, err := algo.GetAlgoStatus(r.Context(), db)

		out := resp{
			InSendWindow:    inWindow,
			UseAlgoTick:     enabled,
			NextTickSeconds: nextSecs,
		}

		if !enabled {
			out.State = "disabled"
		} else if !inWindow {
			out.State = "paused"
		} else if err == nil && st != nil {
			out.LastTickAt = st.LastTickAt
			out.LastEnqueued = st.LastEnqueued
			out.LastError = st.LastError
			out.TickDurationMs = st.TickDurationMs
			if st.LastError != nil && *st.LastError != "" {
				out.State = "error"
			} else {
				out.State = "ok"
			}
		} else {
			// algo_status ainda não tem linha (migration não rodou ou tick nunca rodou)
			out.State = "ok"
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
