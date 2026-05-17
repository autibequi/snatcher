package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// TaxonomyNodeRow representa um nó da árvore taxonomy_node (flat — frontend monta a árvore via parent_id).
type TaxonomyNodeRow struct {
	ID            int64    `db:"id"             json:"id"`
	ParentID      *int64   `db:"parent_id"      json:"parent_id,omitempty"`
	Slug          string   `db:"slug"           json:"slug"`
	NamePT        string   `db:"name_pt"        json:"name_pt"`
	Kind          string   `db:"kind"           json:"kind"`
	ConfidencePct *float64 `db:"confidence_pct" json:"confidence_pct,omitempty"`
}

// fetchTaxonomyTree busca todos os nós da taxonomia ordenados por id.
func fetchTaxonomyTree(r *http.Request, db *sqlx.DB) ([]TaxonomyNodeRow, error) {
	var rows []TaxonomyNodeRow
	err := db.SelectContext(r.Context(), &rows, `
		SELECT id, parent_id, slug, name_pt, kind, confidence_pct
		FROM taxonomy_node
		ORDER BY id
	`)
	return rows, err
}

// GetTaxonomyTreeHandler implementa GET /api/admin/taxonomy/tree.
// Retorna todos os nós da taxonomia em array flat — frontend monta a árvore usando parent_id.
func GetTaxonomyTreeHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := fetchTaxonomyTree(r, db)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar taxonomy tree: "+err.Error())
			return
		}
		if rows == nil {
			rows = []TaxonomyNodeRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// taxonomyFeedbackRequest é o body esperado pelo endpoint de feedback.
type taxonomyFeedbackRequest struct {
	NodeID       int64   `json:"node_id"`
	ChannelID    *int64  `json:"channel_id,omitempty"`
	FeedbackType string  `json:"feedback_type"`
	ReassignedTo *string `json:"reassigned_to,omitempty"`
}

// insertTaxonomyFeedback persiste um novo registro em taxonomy_feedback.
func insertTaxonomyFeedback(r *http.Request, db *sqlx.DB, req taxonomyFeedbackRequest) error {
	_, err := db.ExecContext(r.Context(), `
		INSERT INTO taxonomy_feedback (node_id, channel_id, feedback_type, reassigned_to, created_at)
		VALUES ($1, $2, $3, $4, now())
	`, req.NodeID, req.ChannelID, req.FeedbackType, req.ReassignedTo)
	return err
}

// PostTaxonomyFeedbackHandler implementa POST /api/admin/taxonomy/feedback.
// Body: { node_id, channel_id?, feedback_type, reassigned_to? }
func PostTaxonomyFeedbackHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req taxonomyFeedbackRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "json inválido")
			return
		}
		if req.NodeID == 0 {
			writeErr(w, http.StatusBadRequest, "node_id obrigatório")
			return
		}
		if req.FeedbackType == "" {
			writeErr(w, http.StatusBadRequest, "feedback_type obrigatório")
			return
		}

		if err := insertTaxonomyFeedback(r, db, req); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao inserir feedback: "+err.Error())
			return
		}
		w.WriteHeader(http.StatusCreated)
	}
}
