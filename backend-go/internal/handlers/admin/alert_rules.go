package admin

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// ListAlertRulesHandler retorna todas as alert_rules ordenadas por enabled DESC, name.
//
// GET /api/admin/alert-rules
func ListAlertRulesHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			ID          int64   `db:"id"            json:"id"`
			Name        string  `db:"name"          json:"name"`
			Query       string  `db:"query"         json:"query"`
			Severity    string  `db:"severity"      json:"severity"`
			CooldownMin int     `db:"cooldown_min"  json:"cooldown_min"`
			Enabled     bool    `db:"enabled"       json:"enabled"`
			LastFiredAt *string `db:"last_fired_at" json:"last_fired_at,omitempty"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, `
			SELECT id, name, query, severity, cooldown_min, enabled, last_fired_at::text
			FROM alert_rules
			ORDER BY enabled DESC, name
		`); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// CreateAlertRuleHandler cria uma nova alert_rule.
//
// POST /api/admin/alert-rules — body: {name, query, severity, cooldown_min, enabled}
func CreateAlertRuleHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name        string `json:"name"`
			Query       string `json:"query"`
			Severity    string `json:"severity"`
			CooldownMin int    `json:"cooldown_min"`
			Enabled     bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad json")
			return
		}
		if body.Severity != "critical" && body.Severity != "warning" {
			writeErr(w, http.StatusBadRequest, "severity must be critical or warning")
			return
		}
		if body.Name == "" {
			writeErr(w, http.StatusBadRequest, "name is required")
			return
		}
		if body.Query == "" {
			writeErr(w, http.StatusBadRequest, "query is required")
			return
		}
		if body.CooldownMin <= 0 {
			body.CooldownMin = 60
		}
		var id int64
		if err := db.QueryRowxContext(r.Context(), `
			INSERT INTO alert_rules (name, query, severity, cooldown_min, enabled)
			VALUES ($1, $2, $3, $4, $5) RETURNING id
		`, body.Name, body.Query, body.Severity, body.CooldownMin, body.Enabled).Scan(&id); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]int64{"id": id})
	}
}

// UpdateAlertRuleHandler atualiza uma alert_rule existente.
//
// PUT /api/admin/alert-rules/{id}
func UpdateAlertRuleHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var body struct {
			Name        string `json:"name"`
			Query       string `json:"query"`
			Severity    string `json:"severity"`
			CooldownMin int    `json:"cooldown_min"`
			Enabled     bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad json")
			return
		}
		if body.Severity != "critical" && body.Severity != "warning" {
			writeErr(w, http.StatusBadRequest, "severity must be critical or warning")
			return
		}
		if _, err := db.ExecContext(r.Context(), `
			UPDATE alert_rules
			SET name=$1, query=$2, severity=$3, cooldown_min=$4, enabled=$5
			WHERE id=$6
		`, body.Name, body.Query, body.Severity, body.CooldownMin, body.Enabled, id); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DeleteAlertRuleHandler remove uma alert_rule pelo ID.
//
// DELETE /api/admin/alert-rules/{id}
func DeleteAlertRuleHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		_, _ = db.ExecContext(r.Context(), "DELETE FROM alert_rules WHERE id=$1", id)
		w.WriteHeader(http.StatusNoContent)
	}
}

// TestAlertRuleHandler executa uma query como dry-run e retorna até 10 rows + count.
//
// POST /api/admin/alert-rules/test — body: {query}
func TestAlertRuleHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Query string `json:"query"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad json")
			return
		}
		if body.Query == "" {
			writeErr(w, http.StatusBadRequest, "query is required")
			return
		}
		rows, err := db.QueryxContext(r.Context(), body.Query)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		defer rows.Close()
		var samples []map[string]any
		count := 0
		for rows.Next() {
			m := map[string]any{}
			if scanErr := rows.MapScan(m); scanErr != nil {
				continue
			}
			// []byte → string for JSON serialization
			for k, v := range m {
				if b, ok := v.([]byte); ok {
					m[k] = string(b)
				}
			}
			if count < 10 {
				samples = append(samples, m)
			}
			count++
		}
		if samples == nil {
			samples = []map[string]any{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"count": count, "samples": samples})
	}
}
