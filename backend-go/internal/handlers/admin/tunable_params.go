package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// ListParamsHandler implementa GET /api/admin/parameters.
// Retorna todos os parâmetros tunáveis ordenados por scope_type, scope_id e param_name.
func ListParamsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			ID           int64   `db:"id" json:"id"`
			ScopeType    string  `db:"scope_type" json:"scope_type"`
			ScopeID      *int64  `db:"scope_id" json:"scope_id,omitempty"`
			ParamName    string  `db:"param_name" json:"param_name"`
			CurrentValue float64 `db:"current_value" json:"current_value"`
			DefaultValue float64 `db:"default_value" json:"default_value"`
			MinValue     float64 `db:"min_value" json:"min_value"`
			MaxValue     float64 `db:"max_value" json:"max_value"`
			LastChanged  *string `db:"last_changed" json:"last_changed,omitempty"`
			LastChangeBy *string `db:"last_change_by" json:"last_change_by,omitempty"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, `
			SELECT id, scope_type, scope_id, param_name, current_value, default_value,
			       min_value, max_value, last_changed::text, last_change_by
			FROM tunable_parameters
			ORDER BY scope_type, scope_id NULLS FIRST, param_name
		`); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar parâmetros")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// UpdateParamHandler implementa PUT /api/admin/parameters/{id}.
// Valida bounds antes de atualizar.
func UpdateParamHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		var body struct {
			Value float64 `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "json inválido")
			return
		}
		var minVal, maxVal float64
		if err := db.QueryRowxContext(r.Context(),
			"SELECT min_value, max_value FROM tunable_parameters WHERE id=$1", id,
		).Scan(&minVal, &maxVal); err != nil {
			writeErr(w, http.StatusNotFound, "parâmetro não encontrado")
			return
		}
		if body.Value < minVal || body.Value > maxVal {
			writeErr(w, http.StatusBadRequest, "valor fora dos limites permitidos")
			return
		}
		if _, err := db.ExecContext(r.Context(), `
			UPDATE tunable_parameters
			SET current_value=$1, last_changed=now(), last_change_by='manual_ui'
			WHERE id=$2
		`, body.Value, id); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar parâmetro")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// ResetParamHandler implementa POST /api/admin/parameters/{id}/reset.
// Restaura current_value para default_value.
func ResetParamHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		if _, err := db.ExecContext(r.Context(), `
			UPDATE tunable_parameters
			SET current_value=default_value, last_changed=now(), last_change_by='manual_ui_reset'
			WHERE id=$1
		`, id); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao resetar parâmetro")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

