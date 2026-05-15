package admin

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// ── category_keywords CRUD ────────────────────────────────────────────────────

// GET /api/admin/category-keywords
func CategoryKeywordsListHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			ID           int64  `db:"id"            json:"id"`
			CategorySlug string `db:"category_slug" json:"category_slug"`
			Pattern      string `db:"pattern"       json:"pattern"`
			Active       bool   `db:"active"        json:"active"`
			Source       string `db:"source"        json:"source"`
		}
		var rows []row
		_ = db.SelectContext(r.Context(), &rows,
			`SELECT id, category_slug, pattern, active, source FROM category_keywords ORDER BY category_slug, id`)
		if rows == nil {
			rows = []row{}
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

// POST /api/admin/category-keywords
func CategoryKeywordsAddHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			CategorySlug string `json:"category_slug"`
			Pattern      string `json:"pattern"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CategorySlug == "" || req.Pattern == "" {
			writeErr(w, http.StatusBadRequest, "category_slug e pattern obrigatórios")
			return
		}
		var id int64
		err := db.QueryRowContext(r.Context(), `
			INSERT INTO category_keywords (category_slug, pattern, source)
			VALUES ($1, $2, 'manual')
			ON CONFLICT (category_slug, pattern) DO UPDATE SET active=true
			RETURNING id
		`, req.CategorySlug, req.Pattern).Scan(&id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, fmt.Sprintf("erro ao adicionar: %v", err))
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
	}
}

// DELETE /api/admin/category-keywords/{id}
func CategoryKeywordsDeleteHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		_, _ = db.ExecContext(r.Context(), `DELETE FROM category_keywords WHERE id=$1`, id)
		w.WriteHeader(http.StatusNoContent)
	}
}

// ── brand_keywords CRUD ───────────────────────────────────────────────────────

// GET /api/admin/brand-keywords
func BrandKeywordsListHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			ID           int64  `db:"id"            json:"id"`
			BrandSlug    string `db:"brand_slug"    json:"brand_slug"`
			BrandDisplay string `db:"brand_display" json:"brand_display"`
			Pattern      string `db:"pattern"       json:"pattern"`
			Active       bool   `db:"active"        json:"active"`
			Source       string `db:"source"        json:"source"`
		}
		var rows []row
		_ = db.SelectContext(r.Context(), &rows,
			`SELECT id, brand_slug, brand_display, pattern, active, source FROM brand_keywords ORDER BY brand_slug, id`)
		if rows == nil {
			rows = []row{}
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

// POST /api/admin/brand-keywords
func BrandKeywordsAddHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			BrandSlug    string `json:"brand_slug"`
			BrandDisplay string `json:"brand_display"`
			Pattern      string `json:"pattern"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.BrandSlug == "" || req.Pattern == "" {
			writeErr(w, http.StatusBadRequest, "brand_slug e pattern obrigatórios")
			return
		}
		if req.BrandDisplay == "" {
			req.BrandDisplay = req.BrandSlug
		}
		var id int64
		err := db.QueryRowContext(r.Context(), `
			INSERT INTO brand_keywords (brand_slug, brand_display, pattern, source)
			VALUES ($1, $2, $3, 'manual')
			ON CONFLICT (brand_slug, pattern) DO UPDATE SET active=true
			RETURNING id
		`, req.BrandSlug, req.BrandDisplay, req.Pattern).Scan(&id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, fmt.Sprintf("erro ao adicionar: %v", err))
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
	}
}

// DELETE /api/admin/brand-keywords/{id}
func BrandKeywordsDeleteHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		_, _ = db.ExecContext(r.Context(), `DELETE FROM brand_keywords WHERE id=$1`, id)
		w.WriteHeader(http.StatusNoContent)
	}
}
