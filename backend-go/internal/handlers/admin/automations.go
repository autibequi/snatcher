package admin

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
	ws "snatcher/backendv2/internal/ws"
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

// fetchAutomationKind busca o kind de uma automação pelo id.
// Retorna o kind como string (ex: "critical", "elective") ou erro se não encontrada.
func fetchAutomationKind(r *http.Request, db *sqlx.DB, id string) (string, error) {
	var kind string
	err := db.GetContext(r.Context(), &kind, `SELECT kind FROM automations WHERE id = $1`, id)
	return kind, err
}

// validateAutomationUpdate verifica se a atualização respeita as invariantes da automation.
// Implementa invariante I10: automations críticas (kind='critical') nunca podem ser desabilitadas.
// Retorna erro descritivo se tentar desabilitar uma automation crítica; nil caso contrário.
func validateAutomationUpdate(r *http.Request, db *sqlx.DB, id string, enabled *bool) error {
	// Somente precisamos validar quando enabled está sendo explicitamente definido como false.
	if enabled == nil || *enabled == true {
		return nil
	}

	kind, err := fetchAutomationKind(r, db, id)
	if err != nil {
		return err
	}

	if kind == "critical" {
		return errors.New("invariante I10: automações críticas não podem ser desabilitadas")
	}

	return nil
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

// notifyAutomationChanged envia evento WS "automation_changed" para o frontend
// recarregar a lista de automações imediatamente após uma mudança.
// hub pode ser nil — neste caso vira no-op silencioso.
func notifyAutomationChanged(hub *ws.Hub, id string) {
	if hub == nil {
		return
	}
	hub.Broadcast(ws.Event{
		Type: "automation_changed",
		Data: map[string]any{"id": id},
	})
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
// hub (pode ser nil): se não-nil, envia evento "automation_changed" via WS após UPDATE.
func UpdateAutomationHandler(db *sqlx.DB, hub *ws.Hub) http.HandlerFunc {
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

		// I10: automações críticas nunca podem ser desabilitadas.
		if err := validateAutomationUpdate(r, db, id, req.Enabled); err != nil {
			writeErr(w, http.StatusUnprocessableEntity, err.Error())
			return
		}

		if err := applyAutomationUpdate(r, db, id, req.Enabled, req.IntervalMinutes, req.CronExpr); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar automação")
			return
		}

		// Hot-reload WS: notifica frontend para recarregar a lista de automações.
		notifyAutomationChanged(hub, id)

		w.WriteHeader(http.StatusNoContent)
	}
}

// RunAutomationNowHandler implementa POST /api/admin/automations/{id}/run-now.
// Marca last_run_at e last_status como 'manual_trigger'; o scheduler executa no próximo tick.
// hub (pode ser nil): se não-nil, envia evento "automation_changed" via WS após marcar.
func RunAutomationNowHandler(db *sqlx.DB, hub *ws.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		if err := markAutomationManualTrigger(r, db, id); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao disparar automação")
			return
		}

		// Hot-reload WS: notifica frontend para recarregar a lista de automações.
		notifyAutomationChanged(hub, id)

		w.WriteHeader(http.StatusAccepted)
	}
}
