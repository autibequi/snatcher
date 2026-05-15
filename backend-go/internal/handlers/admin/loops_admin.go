package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/services/loops"
)

// LoopActionsHandler retorna ações recentes de um loop LLM específico.
//
// GET /api/admin/loops/{loop}/actions?days=7
func LoopActionsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		loopName := chi.URLParam(r, "loop")
		days := 7
		if d := r.URL.Query().Get("days"); d != "" {
			if v, err := strconv.Atoi(d); err == nil && v > 0 && v <= 90 {
				days = v
			}
		}
		type row struct {
			ID          int64    `db:"id"           json:"id"`
			ActionType  string   `db:"action_type"  json:"action_type"`
			TargetTable string   `db:"target_table" json:"target_table"`
			TargetID    *int64   `db:"target_id"    json:"target_id,omitempty"`
			Reasoning   *string  `db:"reasoning"    json:"reasoning,omitempty"`
			Confidence  *float64 `db:"confidence"   json:"confidence,omitempty"`
			Evaluation  *string  `db:"evaluation"   json:"evaluation,omitempty"`
			AppliedAt   string   `db:"applied_at"   json:"applied_at"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, `
			SELECT id, action_type, target_table, target_id, reasoning, confidence, evaluation, applied_at::text
			FROM llm_actions
			WHERE loop_name = $1 AND applied_at > now() - $2 * INTERVAL '1 day'
			ORDER BY applied_at DESC LIMIT 200
		`, loopName, days); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar ações do loop")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// SetLoopStatusHandler altera o status de autonomia de um loop LLM.
//
// POST /api/admin/loops/{loop}/status — body: {"status":"active|suggesting|disabled","notes":"..."}
func SetLoopStatusHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		loopName := chi.URLParam(r, "loop")
		var body struct {
			Status string `json:"status"`
			Notes  string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad json")
			return
		}
		if body.Status != "active" && body.Status != "suggesting" && body.Status != "disabled" {
			writeErr(w, http.StatusBadRequest, "invalid status: must be active|suggesting|disabled")
			return
		}
		if _, err := db.ExecContext(r.Context(), `
			UPDATE llm_autonomy
			SET status=$1,
			    notes=COALESCE(NULLIF($2, ''), notes),
			    strikes_30d = CASE WHEN $1='active' THEN 0 ELSE strikes_30d END
			WHERE loop_name=$3
		`, body.Status, body.Notes, loopName); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// RunLoopNowHandler dispara execução imediata de um loop LLM (ignora schedule).
//
// POST /api/admin/loops/{loop}/run
func RunLoopNowHandler(db *sqlx.DB) http.HandlerFunc {
	registry := map[string]loops.LoopFunc{
		"taxonomy_grow":    loops.RunTaxonomyGrow,
		"scraper_fix":      loops.RunScraperFix,
		"template_ab":      loops.RunTemplateAB,
		"anomaly_pause":    loops.RunAnomalyPause,
		"affinity_adjust":  loops.RunAffinityAdjust,
		"cooldown_suggest": loops.RunCooldownSuggest,
		"cap_suggest":      loops.RunCapSuggest,
		"auto_tuning":      loops.RunAutoTuning,
		"content_optimize": loops.RunContentOptimize,
	}
	return func(w http.ResponseWriter, r *http.Request) {
		loopName := chi.URLParam(r, "loop")
		fn, ok := registry[loopName]
		if !ok {
			writeErr(w, http.StatusBadRequest, "loop desconhecido: "+loopName)
			return
		}
		go loops.RunLoop(context.Background(), db, loopName, fn)
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "started", "loop": loopName})
	}
}

// ResetStrikesHandler zera o contador de strikes de um loop LLM.
//
// POST /api/admin/loops/{loop}/reset_strikes
func ResetStrikesHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		loopName := chi.URLParam(r, "loop")
		if _, err := db.ExecContext(r.Context(),
			"UPDATE llm_autonomy SET strikes_30d=0, last_strike_at=NULL WHERE loop_name=$1",
			loopName,
		); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
