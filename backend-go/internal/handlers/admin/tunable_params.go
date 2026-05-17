package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/repositories"
)

// ListParamsHandler implementa GET /api/admin/parameters.
// Retorna todos os parâmetros tunáveis ordenados por scope_type, scope_id e param_name.
func ListParamsHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewTunableParamsRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := repo.List(r.Context())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar parâmetros")
			return
		}
		if rows == nil {
			rows = []repositories.TunableParam{}
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

// UpdateParamHandler implementa PUT /api/admin/parameters/{id}.
// Valida bounds antes de atualizar.
func UpdateParamHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewTunableParamsRepo(db)
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
		minVal, maxVal, err := repo.GetBounds(r.Context(), id)
		if err != nil {
			writeErr(w, http.StatusNotFound, "parâmetro não encontrado")
			return
		}
		if body.Value < minVal || body.Value > maxVal {
			writeErr(w, http.StatusBadRequest, "valor fora dos limites permitidos")
			return
		}
		if err := repo.Update(r.Context(), id, body.Value, "manual_ui"); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar parâmetro")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// ResetParamHandler implementa POST /api/admin/parameters/{id}/reset.
// Restaura current_value para default_value.
func ResetParamHandler(db *sqlx.DB) http.HandlerFunc {
	repo := repositories.NewTunableParamsRepo(db)
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		if err := repo.Reset(r.Context(), id, "manual_ui_reset"); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao resetar parâmetro")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
