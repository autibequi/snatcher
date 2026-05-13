package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

type TemplatesHandler struct {
	db *sqlx.DB
}

func NewTemplatesHandler(db *sqlx.DB) *TemplatesHandler {
	return &TemplatesHandler{db: db}
}

type templateRow struct {
	ID              int64    `db:"id" json:"id"`
	CategoryID      int64    `db:"category_id" json:"category_id"`
	CategorySlug    string   `db:"category_slug" json:"category_slug"`
	Body            string   `db:"body" json:"body"`
	Weight          int      `db:"weight" json:"weight"`
	Enabled         bool     `db:"enabled" json:"enabled"`
	OptimalHours    []int32  `db:"-" json:"optimal_hours,omitempty"`
	SentimentTarget *string  `db:"sentiment_target" json:"sentiment_target,omitempty"`
	CreatedAt       string   `db:"created_at" json:"created_at"`
}

type templateRowDB struct {
	ID              int64   `db:"id"`
	CategoryID      int64   `db:"category_id"`
	CategorySlug    string  `db:"category_slug"`
	Body            string  `db:"body"`
	Weight          int     `db:"weight"`
	Enabled         bool    `db:"enabled"`
	OptimalHoursRaw []byte  `db:"optimal_hours_raw"`
	SentimentTarget *string `db:"sentiment_target"`
	CreatedAt       string  `db:"created_at"`
}

const listTemplatesSQL = `
	SELECT t.id, t.category_id, c.slug AS category_slug, t.body, t.weight, t.enabled,
	       t.optimal_hours::text AS optimal_hours_raw, t.sentiment_target, t.created_at::text
	FROM templates t
	JOIN categories c ON c.id = t.category_id
	ORDER BY c.slug, t.weight DESC, t.id
`

func (h *TemplatesHandler) List(w http.ResponseWriter, r *http.Request) {
	var rows []templateRowDB
	if err := h.db.SelectContext(r.Context(), &rows, listTemplatesSQL); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar templates")
		return
	}

	out := make([]templateRow, 0, len(rows))
	for _, row := range rows {
		tr := templateRow{
			ID:              row.ID,
			CategoryID:      row.CategoryID,
			CategorySlug:    row.CategorySlug,
			Body:            row.Body,
			Weight:          row.Weight,
			Enabled:         row.Enabled,
			SentimentTarget: row.SentimentTarget,
			CreatedAt:       row.CreatedAt,
		}
		if len(row.OptimalHoursRaw) > 0 && string(row.OptimalHoursRaw) != "NULL" {
			var hours []int32
			if err := json.Unmarshal(row.OptimalHoursRaw, &hours); err == nil {
				tr.OptimalHours = hours
			}
		}
		out = append(out, tr)
	}

	writeJSON(w, http.StatusOK, out)
}

func (h *TemplatesHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	type catRow struct {
		ID   int64  `db:"id" json:"id"`
		Slug string `db:"slug" json:"slug"`
		Name string `db:"name" json:"name"`
	}
	var rows []catRow
	if err := h.db.SelectContext(r.Context(), &rows, `SELECT id, slug, name FROM categories ORDER BY name`); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar categorias")
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *TemplatesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CategoryID      int64   `json:"category_id"`
		Body            string  `json:"body"`
		Weight          *int    `json:"weight"`
		Enabled         *bool   `json:"enabled"`
		SentimentTarget *string `json:"sentiment_target"`
	}
	if err := decodeBody(r, &req); err != nil || req.CategoryID == 0 || req.Body == "" {
		writeErr(w, http.StatusBadRequest, "category_id e body são obrigatórios")
		return
	}

	weight := 1
	if req.Weight != nil {
		weight = *req.Weight
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	var id int64
	err := h.db.QueryRowxContext(r.Context(),
		`INSERT INTO templates (category_id, body, weight, enabled, sentiment_target)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		req.CategoryID, req.Body, weight, enabled, req.SentimentTarget,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar template")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (h *TemplatesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}

	var req struct {
		CategoryID      *int64  `json:"category_id"`
		Body            *string `json:"body"`
		Weight          *int    `json:"weight"`
		Enabled         *bool   `json:"enabled"`
		SentimentTarget *string `json:"sentiment_target"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}

	res, err := h.db.ExecContext(r.Context(), `
		UPDATE templates SET
			category_id      = COALESCE($2, category_id),
			body             = COALESCE($3, body),
			weight           = COALESCE($4, weight),
			enabled          = COALESCE($5, enabled),
			sentiment_target = COALESCE($6, sentiment_target)
		WHERE id = $1`,
		id, req.CategoryID, req.Body, req.Weight, req.Enabled, req.SentimentTarget,
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar template")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "template não encontrado")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *TemplatesHandler) Toggle(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}

	var enabled bool
	err := h.db.QueryRowxContext(r.Context(),
		`UPDATE templates SET enabled = NOT enabled WHERE id = $1 RETURNING enabled`, id,
	).Scan(&enabled)
	if err != nil {
		writeErr(w, http.StatusNotFound, "template não encontrado")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
}

func (h *TemplatesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}

	res, err := h.db.ExecContext(r.Context(), `DELETE FROM templates WHERE id = $1`, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar template")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "template não encontrado")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
