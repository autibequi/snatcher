package admin

import (
	"net/http"
	"time"

	"github.com/jmoiron/sqlx"
)

type domainRow struct {
	ID              int64      `db:"id"               json:"id"`
	Host            string     `db:"host"             json:"host"`
	Enabled         bool       `db:"enabled"          json:"enabled"`
	QuarantineUntil *time.Time `db:"quarantine_until" json:"quarantine_until,omitempty"`
	CreatedAt       time.Time  `db:"created_at"       json:"created_at"`
}

func ListRedirectDomainsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var rows []domainRow
		if err := db.SelectContext(r.Context(), &rows,
			`SELECT id, host, enabled, quarantine_until, created_at FROM redirect_domains ORDER BY created_at`); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao listar domínios")
			return
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

func CreateRedirectDomainHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Host string `json:"host"`
		}
		if err := decodeBody(r, &req); err != nil || req.Host == "" {
			writeErr(w, http.StatusBadRequest, "host obrigatório")
			return
		}
		var id int64
		err := db.QueryRowxContext(r.Context(),
			`INSERT INTO redirect_domains (host, enabled) VALUES ($1, true) RETURNING id`, req.Host,
		).Scan(&id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao criar domínio (já existe?)")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": id})
	}
}

func ToggleRedirectDomainHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		var enabled bool
		err := db.QueryRowxContext(r.Context(),
			`UPDATE redirect_domains SET enabled = NOT enabled WHERE id=$1 RETURNING enabled`, id,
		).Scan(&enabled)
		if err != nil {
			writeErr(w, http.StatusNotFound, "domínio não encontrado")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
	}
}

func DeleteRedirectDomainHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		res, err := db.ExecContext(r.Context(), `DELETE FROM redirect_domains WHERE id=$1`, id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao deletar")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			writeErr(w, http.StatusNotFound, "domínio não encontrado")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}
