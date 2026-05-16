package admin

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// Automation representa uma automação configurada no sistema.
// Persiste na tabela `automations` (criada na migration W5).
type Automation struct {
	ID                  string  `db:"id"                    json:"id"`
	Kind                string  `db:"kind"                  json:"kind"`
	Enabled             bool    `db:"enabled"               json:"enabled"`
	CronExpr            *string `db:"cron_expr"             json:"cron_expr,omitempty"`
	IntervalMinutes     *int    `db:"interval_minutes"      json:"interval_minutes,omitempty"`
	ControlledByJonfrey bool    `db:"controlled_by_jonfrey" json:"controlled_by_jonfrey"`
	Params              string  `db:"params"                json:"params"`
	LastRunAt           *string `db:"last_run_at"           json:"last_run_at,omitempty"`
	LastStatus          *string `db:"last_status"           json:"last_status,omitempty"`
}

// fetchAllAutomations busca todas as automações ordenadas por tipo e id.
func fetchAllAutomations(r *http.Request, db *sqlx.DB) ([]Automation, error) {
	var rows []Automation
	err := db.SelectContext(r.Context(), &rows, `
		SELECT
			id,
			kind,
			enabled,
			cron_expr,
			interval_minutes,
			controlled_by_jonfrey,
			params::text AS params,
			last_run_at::text AS last_run_at,
			last_status
		FROM automations
		ORDER BY kind, id
	`)
	return rows, err
}

// applyAutomationUpdate aplica os campos PATCH na tabela automations.
// Usa COALESCE para atualizar apenas os campos enviados.
func applyAutomationUpdate(r *http.Request, db *sqlx.DB, id string, enabled *bool, intervalMinutes *int, cronExpr *string) error {
	_, err := db.ExecContext(r.Context(), `
		UPDATE automations
		SET
			enabled          = COALESCE($1, enabled),
			interval_minutes = COALESCE($2, interval_minutes),
			cron_expr        = COALESCE($3, cron_expr),
			updated_at       = now()
		WHERE id = $4
	`, enabled, intervalMinutes, cronExpr, id)
	return err
}

// markAutomationManualTrigger registra last_run_at e last_status para run-now.
// O scheduler real executará no próximo tick; este handler apenas sinaliza disparo manual.
func markAutomationManualTrigger(r *http.Request, db *sqlx.DB, id string) error {
	_, err := db.ExecContext(r.Context(), `
		UPDATE automations
		SET last_run_at = now(), last_status = 'manual_trigger'
		WHERE id = $1
	`, id)
	return err
}

// ListAutomationsHandler implementa GET /api/admin/automations.
// Retorna todas as automações cadastradas ordenadas por kind e id.
func ListAutomationsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := fetchAllAutomations(r, db)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar automações")
			return
		}
		if rows == nil {
			rows = []Automation{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// UpdateAutomationHandler implementa PATCH /api/admin/automations/{id}.
// Aceita enabled, interval_minutes e cron_expr como campos opcionais.
func UpdateAutomationHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var req struct {
			Enabled         *bool   `json:"enabled,omitempty"`
			IntervalMinutes *int    `json:"interval_minutes,omitempty"`
			CronExpr        *string `json:"cron_expr,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "json inválido")
			return
		}

		if err := applyAutomationUpdate(r, db, id, req.Enabled, req.IntervalMinutes, req.CronExpr); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar automação")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// RunAutomationNowHandler implementa POST /api/admin/automations/{id}/run-now.
// Marca last_run_at e last_status como 'manual_trigger'; o scheduler executa no próximo tick.
// W5 follow-up: integrar com scheduler real para force-run síncrono.
func RunAutomationNowHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		if err := markAutomationManualTrigger(r, db, id); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao disparar automação")
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}
}
