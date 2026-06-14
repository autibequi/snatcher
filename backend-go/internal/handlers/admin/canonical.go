package admin

import (
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// CanonicalGroupRow representa um canonical_product com contagem de filhos e marketplaces cobertos.
type CanonicalGroupRow struct {
	ID             int64          `db:"id"              json:"id"`
	TitleCanonical string         `db:"title_canonical" json:"title_canonical"`
	BrandID        *int64         `db:"brand_id"        json:"brand_id,omitempty"`
	PriceBand      *string        `db:"price_band"      json:"price_band,omitempty"`
	LowConfidence  bool           `db:"low_confidence"  json:"low_confidence"`
	CreatedAt      string         `db:"created_at"      json:"created_at"`
	ChildrenCount  int            `db:"children_count"  json:"children_count"`
	Marketplaces   pq.StringArray `db:"marketplaces"    json:"marketplaces"`
}

// fetchCanonicalGroups busca canonical_products com contagem de filhos e marketplaces.
func fetchCanonicalGroups(r *http.Request, db *sqlx.DB) ([]CanonicalGroupRow, error) {
	var rows []CanonicalGroupRow
	err := db.SelectContext(r.Context(), &rows, `
		SELECT
			cp.id,
			cp.title_canonical,
			cp.brand_id,
			cp.price_band,
			cp.low_confidence,
			cp.created_at::text AS created_at,
			COUNT(c.id) AS children_count,
			ARRAY_AGG(DISTINCT split_part(c.dedup_key, ':', 1)) FILTER (WHERE c.dedup_key IS NOT NULL) AS marketplaces
		FROM canonical_products cp
		LEFT JOIN catalog c ON c.canonical_product_id = cp.id
		GROUP BY cp.id
		ORDER BY cp.created_at DESC
		LIMIT 100
	`)
	return rows, err
}

// CanonicalChildRow — item de catálogo vinculado a um canonical_product (filho do grupo).
type CanonicalChildRow struct {
	ID           int64    `db:"id"            json:"id"`
	Title        string   `db:"title"         json:"title"`
	SourceID     string   `db:"source_id"     json:"source_id"`
	Marketplace  string   `db:"marketplace"   json:"marketplace"`
	PriceCurrent *float64 `db:"price_current" json:"price_current,omitempty"`
}

// ListCanonicalChildrenHandler implementa GET /api/admin/canonical-groups/{id}/children.
// Lista os itens de catálogo (catalog) vinculados a um canonical_product via
// canonical_product_id — os "filhos" exibidos ao expandir um grupo canônico.
func ListCanonicalChildrenHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathInt(r, "id")
		if !ok {
			writeErr(w, http.StatusBadRequest, "id inválido")
			return
		}
		var rows []CanonicalChildRow
		err := db.SelectContext(r.Context(), &rows, `
			SELECT c.id, c.title, c.source_id,
			       split_part(c.dedup_key, ':', 1) AS marketplace,
			       c.price_current
			FROM catalog c
			WHERE c.canonical_product_id = $1
			ORDER BY c.price_current ASC NULLS LAST
			LIMIT 200
		`, id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar filhos: "+err.Error())
			return
		}
		if rows == nil {
			rows = []CanonicalChildRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}

// ListCanonicalGroupsHandler implementa GET /api/admin/canonical-groups.
// Retorna canonical_products com contagem de filhos catalog e marketplaces cobertos.
// Tabela vazia retorna [] sem 500.
func ListCanonicalGroupsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := fetchCanonicalGroups(r, db)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao buscar canonical groups: "+err.Error())
			return
		}
		if rows == nil {
			rows = []CanonicalGroupRow{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	}
}
