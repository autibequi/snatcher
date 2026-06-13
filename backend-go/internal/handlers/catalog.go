package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// GET /api/catalog/:id
// Retorna o produto do catálogo v2. `variants` é mantido vazio por compat de contrato
// (o catálogo v1 catalogproduct/catalogvariant foi removido na W2 do refactor 2026-06).
// Resposta: { product: {...}, variants: [] }
func CatalogGetHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			http.Error(w, "id inválido", http.StatusBadRequest)
			return
		}

		type product struct {
			ID                int64    `db:"id"                  json:"id"`
			ShortID           string   `db:"short_id"            json:"short_id"`
			SourceID          string   `db:"source_id"           json:"source_id"`
			CategoryID        *int64   `db:"category_id"         json:"category_id,omitempty"`
			CategoryName      *string  `db:"category_name"       json:"category_name,omitempty"`
			Title             string   `db:"title"               json:"title"`
			ImageURL          *string  `db:"image_url"           json:"image_url,omitempty"`
			CanonicalURL      string   `db:"canonical_url"       json:"canonical_url"`
			PriceOriginal     *float64 `db:"price_original"      json:"price_original,omitempty"`
			PriceCurrent      float64  `db:"price_current"       json:"price_current"`
			LowestPrice       *float64 `db:"lowest_price"        json:"lowest_price,omitempty"`
			DiscountPct       *float64 `db:"discount_pct"        json:"discount_pct,omitempty"`
			QualityScore      *float64 `db:"quality_score"       json:"quality_score,omitempty"`
			SendReady         bool     `db:"send_ready"          json:"send_ready"`
			CatalogStatus     *string  `db:"catalog_status"      json:"catalog_status,omitempty"`
			CanonicalURLAlive bool     `db:"canonical_url_alive" json:"canonical_url_alive"`
			LastPriceDropAt   *string  `db:"last_price_drop_at"  json:"last_price_drop_at,omitempty"`
			CreatedAt         string   `db:"created_at"          json:"created_at"`
		}
		var p product
		// Catálogo v2 é o caminho único (v1 catalogproduct/catalogvariant removido na W2).
		err = db.GetContext(r.Context(), &p, `
			SELECT c.id, c.short_id, c.source_id, c.category_id,
			       ct.display_name AS category_name,
			       c.title, c.image_url, c.canonical_url,
			       c.price_original, c.price_current, c.lowest_price, c.discount_pct,
			       c.quality_score, c.send_ready, c.catalog_status, c.canonical_url_alive,
			       c.last_price_drop_at::text AS last_price_drop_at,
			       c.created_at::text AS created_at
			FROM catalog c
			LEFT JOIN categories ct ON ct.id = c.category_id
			WHERE c.id = $1
		`, id)
		if err != nil {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		// variants mantido (vazio) por compat de contrato com o frontend.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"product":  p,
			"variants": []any{},
		})
	}
}

// GET /api/catalog/search?q=termo&limit=8
// Busca full-text simples por título no catálogo canônico.
func CatalogSearchHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if len(q) < 2 {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte("[]"))
			return
		}
		limit := 8
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 50 {
			limit = v
		}

		type row struct {
			ID           int64    `db:"id"           json:"id"`
			Title        string   `db:"title"        json:"title"`
			ImageURL     *string  `db:"image_url"    json:"image_url,omitempty"`
			PriceCurrent float64  `db:"price_current" json:"price_current"`
			DiscountPct  *float64 `db:"discount_pct" json:"discount_pct,omitempty"`
			QualityScore *float64 `db:"quality_score" json:"quality_score,omitempty"`
			SourceID     string   `db:"source_id"    json:"source_id"`
		}
		var rows []row
		_ = db.SelectContext(r.Context(), &rows, `
			SELECT id, title, image_url, price_current, discount_pct, quality_score, source_id
			FROM catalog
			WHERE (send_ready = true OR catalog_status = 'ready')
			  AND title ILIKE '%' || $1 || '%'
			ORDER BY quality_score DESC NULLS LAST, price_current DESC
			LIMIT $2
		`, q, limit)
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}
