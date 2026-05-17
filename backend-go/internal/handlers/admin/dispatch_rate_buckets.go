package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// RateBucketRow representa uma linha da tabela rate_buckets.
type RateBucketRow struct {
	ScopeType      string  `db:"scope_type"       json:"scope_type"`
	ScopeID        string  `db:"scope_id"         json:"scope_id"`
	TokensPerMinute float64 `db:"tokens_per_minute" json:"tokens_per_minute"`
	CurrentTokens  float64 `db:"current_tokens"   json:"current_tokens"`
	RefilledAt     *string `db:"refilled_at"      json:"refilled_at,omitempty"`
}

// fetchRateBuckets busca os buckets de rate-limit com filtro opcional por scope_type.
func fetchRateBuckets(r *http.Request, db *sqlx.DB, scopeType string) ([]RateBucketRow, error) {
	var rows []RateBucketRow
	var err error

	if scopeType != "" {
		// Filtro por scope_type quando o parâmetro está presente.
		err = db.SelectContext(r.Context(), &rows, `
			SELECT scope_type, scope_id, tokens_per_minute, current_tokens, refilled_at::text AS refilled_at
			FROM rate_buckets
			WHERE scope_type = $1
			ORDER BY scope_type, scope_id
		`, scopeType)
	} else {
		err = db.SelectContext(r.Context(), &rows, `
			SELECT scope_type, scope_id, tokens_per_minute, current_tokens, refilled_at::text AS refilled_at
			FROM rate_buckets
			ORDER BY scope_type, scope_id
		`)
	}
	return rows, err
}

// ListRateBucketsHandler implementa GET /api/admin/dispatch/rate-buckets.
// Suporta filtro opcional ?scope_type=group|channel|modem.
func ListRateBucketsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		scopeType := r.URL.Query().Get("scope_type")

		rows, err := fetchRateBuckets(r, db, scopeType)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar rate buckets: "+err.Error())
			return
		}
		if rows == nil {
			rows = []RateBucketRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}
