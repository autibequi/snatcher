package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// JonfreyDecisionRow representa uma decisão da tabela jonfrey_decisions.
type JonfreyDecisionRow struct {
	ID           int64  `db:"id"            json:"id"`
	AutomationID string `db:"automation_id" json:"automation_id"`
	Decision     string `db:"decision"      json:"decision"`
	Reason       string `db:"reason"        json:"reason"`
	Payload      string `db:"payload"       json:"payload"`
	CreatedAt    string `db:"created_at"    json:"created_at"`
}

// JonfreyDecisionsResponse encapsula a lista de decisões com o contador anti-loop das últimas 24h.
type JonfreyDecisionsResponse struct {
	Decisions         []JonfreyDecisionRow `json:"decisions"`
	EscalationCount24h int                 `json:"escalation_count_24h"`
}

// fetchJonfreyDecisions busca decisões do jonfrey com filtros opcionais.
func fetchJonfreyDecisions(r *http.Request, db *sqlx.DB, automationID, decisionType string) ([]JonfreyDecisionRow, error) {
	var rows []JonfreyDecisionRow
	err := db.SelectContext(r.Context(), &rows, `
		SELECT id, automation_id, decision, reason,
		       COALESCE(payload::text, '{}') AS payload,
		       created_at::text AS created_at
		FROM jonfrey_decisions
		WHERE ($1::text IS NULL OR automation_id = $1::text)
		  AND ($2::text IS NULL OR decision = $2::text)
		ORDER BY created_at DESC
		LIMIT 200
	`, nullableString(automationID), nullableString(decisionType))
	return rows, err
}

// fetchEscalationCount24h retorna o número de decisões 'escalate_to_human' nas últimas 24h.
// Esse contador alimenta o banner anti-loop no frontend.
func fetchEscalationCount24h(r *http.Request, db *sqlx.DB) (int, error) {
	var count int
	err := db.GetContext(r.Context(), &count, `
		SELECT COUNT(*)
		FROM jonfrey_decisions
		WHERE decision = 'escalate_to_human'
		  AND created_at > now() - interval '24 hours'
	`)
	return count, err
}

// nullableString converte string vazia em nil para uso como parâmetro $N nullable no SQL.
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ListJonfreyDecisionsHandler implementa GET /api/admin/jonfrey/decisions.
// Filtros opcionais: ?automation_id=...&decision_type=...
// Inclui campo escalation_count_24h para banner anti-loop.
func ListJonfreyDecisionsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		automationID := r.URL.Query().Get("automation_id")
		decisionType := r.URL.Query().Get("decision_type")

		decisions, err := fetchJonfreyDecisions(r, db, automationID, decisionType)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar decisões: "+err.Error())
			return
		}
		if decisions == nil {
			decisions = []JonfreyDecisionRow{}
		}

		escalationCount, err := fetchEscalationCount24h(r, db)
		if err != nil {
			// Não bloquear a resposta por falha no contador; retornar 0 como fallback.
			escalationCount = 0
		}

		resp := JonfreyDecisionsResponse{
			Decisions:         decisions,
			EscalationCount24h: escalationCount,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}
