package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// QuarantineEventRow representa um evento da tabela quarantine_events.
type QuarantineEventRow struct {
	ID              int64   `db:"id"               json:"id"`
	SubjectKind     string  `db:"subject_kind"     json:"subject_kind"`
	SubjectID       string  `db:"subject_id"       json:"subject_id"`
	Reason          string  `db:"reason"           json:"reason"`
	TriggeredAt     string  `db:"triggered_at"     json:"triggered_at"`
	QuarantineUntil *string `db:"quarantine_until" json:"quarantine_until,omitempty"`
	LiftedAt        *string `db:"lifted_at"        json:"lifted_at,omitempty"`
	LiftedBy        *string `db:"lifted_by"        json:"lifted_by,omitempty"`
	Payload         string  `db:"payload"          json:"payload"`
}

// fetchQuarantineEvents busca eventos de quarentena com filtros opcionais de subject_kind e active.
// active=true → apenas eventos não levantados (lifted_at IS NULL).
// active=false → apenas eventos já resolvidos (lifted_at IS NOT NULL).
// Sem filtro active → retorna todos.
func fetchQuarantineEvents(r *http.Request, db *sqlx.DB, subjectKind *string, active *bool) ([]QuarantineEventRow, error) {
	var rows []QuarantineEventRow
	err := db.SelectContext(r.Context(), &rows, `
		SELECT id, subject_kind, subject_id, reason,
		       triggered_at::text AS triggered_at,
		       quarantine_until::text AS quarantine_until,
		       lifted_at::text AS lifted_at,
		       lifted_by,
		       COALESCE(payload::text, '{}') AS payload
		FROM quarantine_events
		WHERE ($1::text IS NULL OR subject_kind = $1::text)
		  AND ($2::bool IS NULL OR ($2::bool = true AND lifted_at IS NULL) OR ($2::bool = false AND lifted_at IS NOT NULL))
		ORDER BY triggered_at DESC
		LIMIT 100
	`, subjectKind, active)
	return rows, err
}

// ListQuarantineHandler implementa GET /api/admin/quarantine.
// Filtros opcionais: ?subject_kind=...&active=true|false
func ListQuarantineHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Filtro subject_kind (nil = sem filtro).
		var subjectKind *string
		if sk := r.URL.Query().Get("subject_kind"); sk != "" {
			subjectKind = &sk
		}

		// Filtro active: nil = sem filtro, true = apenas ativos, false = apenas resolvidos.
		var active *bool
		if av := r.URL.Query().Get("active"); av != "" {
			isActive := av == "true" || av == "1"
			active = &isActive
		}

		rows, err := fetchQuarantineEvents(r, db, subjectKind, active)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar eventos de quarentena: "+err.Error())
			return
		}
		if rows == nil {
			rows = []QuarantineEventRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}
