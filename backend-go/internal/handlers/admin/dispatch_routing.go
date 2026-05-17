package admin

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// DispatchRoutingRow representa a junção modem_routing × modems × redirect_domains.
type DispatchRoutingRow struct {
	ModemID       int64    `db:"modem_id"       json:"modem_id"`
	ModemName     string   `db:"modem_name"     json:"modem_name"`
	DomainID      int64    `db:"domain_id"      json:"domain_id"`
	DomainHost    string   `db:"domain_host"    json:"domain_host"`
	AffinityScore float64  `db:"affinity_score" json:"affinity_score"`
	SeededAt      *string  `db:"seeded_at"      json:"seeded_at,omitempty"`
	LastUsedAt    *string  `db:"last_used_at"   json:"last_used_at,omitempty"`
}

// fetchDispatchRouting busca o roteamento de modems com os dados das tabelas relacionadas.
func fetchDispatchRouting(r *http.Request, db *sqlx.DB) ([]DispatchRoutingRow, error) {
	var rows []DispatchRoutingRow
	err := db.SelectContext(r.Context(), &rows, `
		SELECT
			mr.modem_id,
			m.slug AS modem_name,
			mr.domain_id,
			rd.host AS domain_host,
			mr.affinity_score,
			mr.seeded_at::text AS seeded_at,
			mr.last_used_at::text AS last_used_at
		FROM modem_routing mr
		JOIN modems m ON m.id = mr.modem_id
		JOIN redirect_domains rd ON rd.id = mr.domain_id
		ORDER BY mr.modem_id, mr.affinity_score DESC
	`)
	return rows, err
}

// ListDispatchRoutingHandler implementa GET /api/admin/dispatch/routing.
// Retorna o roteamento atual dos modems com affinity scores.
func ListDispatchRoutingHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := fetchDispatchRouting(r, db)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar roteamento: "+err.Error())
			return
		}
		if rows == nil {
			rows = []DispatchRoutingRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// patchAffinityScore atualiza o affinity_score de um par modem/domínio específico.
func patchAffinityScore(r *http.Request, db *sqlx.DB, modemID, domainID int64, affinityScore float64) error {
	_, err := db.ExecContext(r.Context(), `
		UPDATE modem_routing
		SET affinity_score = $1
		WHERE modem_id = $2 AND domain_id = $3
	`, affinityScore, modemID, domainID)
	return err
}

// PatchDispatchRoutingHandler implementa PATCH /api/admin/dispatch/routing/{modem_id}/{domain_id}.
// Body: { affinity_score: float }
func PatchDispatchRoutingHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		modemID, err := strconv.ParseInt(chi.URLParam(r, "modem_id"), 10, 64)
		if err != nil || modemID <= 0 {
			writeErr(w, http.StatusBadRequest, "modem_id inválido")
			return
		}
		domainID, err := strconv.ParseInt(chi.URLParam(r, "domain_id"), 10, 64)
		if err != nil || domainID <= 0 {
			writeErr(w, http.StatusBadRequest, "domain_id inválido")
			return
		}

		var req struct {
			AffinityScore float64 `json:"affinity_score"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "json inválido")
			return
		}

		if err := patchAffinityScore(r, db, modemID, domainID, req.AffinityScore); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar affinity_score: "+err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
