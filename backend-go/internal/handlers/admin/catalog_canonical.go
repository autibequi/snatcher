package admin

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/jmoiron/sqlx"
)

// GET /api/admin/catalog-canonical?ready_only=1&category_id=N&limit=50&offset=0
func ListCatalogCanonicalHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		readyOnly := r.URL.Query().Get("ready_only") == "1"
		categoryID, _ := strconv.ParseInt(r.URL.Query().Get("category_id"), 10, 64)
		limit := 50
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 200 {
			limit = v
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		// Filtro por IDs específicos: ?ids=1,2,3 — usado pelo Composer como fallback de /api/catalog/:id
		var specificIDs []int64
		if idsParam := r.URL.Query().Get("ids"); idsParam != "" {
			for _, s := range strings.Split(idsParam, ",") {
				s = strings.TrimSpace(s)
				if id, err := strconv.ParseInt(s, 10, 64); err == nil && id > 0 {
					specificIDs = append(specificIDs, id)
				}
			}
		}

		where := []string{"1=1"}
		args := []any{}
		i := 1
		if readyOnly {
			where = append(where, "c.send_ready = true AND c.canonical_url_alive = true")
		}
		if len(specificIDs) > 0 {
			placeholders := make([]string, len(specificIDs))
			for j, id := range specificIDs {
				placeholders[j] = "$" + strconv.Itoa(i)
				args = append(args, id)
				i++
			}
			where = append(where, "c.id IN ("+strings.Join(placeholders, ",")+")")
			limit = len(specificIDs) // retorna exatamente os IDs pedidos
			offset = 0
		} else if categoryID > 0 {
			where = append(where, "c.category_id = $"+strconv.Itoa(i))
			args = append(args, categoryID)
			i++
		}
		args = append(args, limit, offset)
		q := `
			SELECT c.id, c.short_id, c.dedup_key, c.source_id, c.category_id,
			       ct.display_name AS category_name,
			       c.title, c.image_url, c.price_original, c.price_current, c.discount_pct,
			       c.quality_score, c.send_ready, c.canonical_url_alive, c.canonical_url,
			       c.created_at::text AS created_at, c.send_ready_at::text AS send_ready_at
			FROM catalog c
			LEFT JOIN categories ct ON ct.id = c.category_id
			WHERE ` + joinAnd(where) + `
			ORDER BY c.quality_score DESC NULLS LAST, c.created_at DESC
			LIMIT $` + strconv.Itoa(i) + ` OFFSET $` + strconv.Itoa(i+1)

		type row struct {
			ID                int64    `db:"id" json:"id"`
			ShortID           string   `db:"short_id" json:"short_id"`
			DedupKey          string   `db:"dedup_key" json:"dedup_key"`
			SourceID          string   `db:"source_id" json:"source_id"`
			CategoryID        *int64   `db:"category_id" json:"category_id,omitempty"`
			CategoryName      *string  `db:"category_name" json:"category_name,omitempty"`
			Title             string   `db:"title" json:"title"`
			ImageURL          *string  `db:"image_url" json:"image_url,omitempty"`
			PriceOriginal     *float64 `db:"price_original" json:"price_original,omitempty"`
			PriceCurrent      float64  `db:"price_current" json:"price_current"`
			DiscountPct       *float64 `db:"discount_pct" json:"discount_pct,omitempty"`
			QualityScore      *float64 `db:"quality_score" json:"quality_score,omitempty"`
			SendReady         bool     `db:"send_ready" json:"send_ready"`
			CanonicalURLAlive bool     `db:"canonical_url_alive" json:"canonical_url_alive"`
			CanonicalURL      *string  `db:"canonical_url" json:"canonical_url,omitempty"`
			CreatedAt         string   `db:"created_at" json:"created_at"`
			SendReadyAt       *string  `db:"send_ready_at" json:"send_ready_at,omitempty"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, q, args...); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		if rows == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
		json.NewEncoder(w).Encode(rows) //nolint:errcheck
	}
}

// GET /api/admin/catalog-canonical/stats
func CatalogCanonicalStatsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out := map[string]any{}
		var n int
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog")
		out["total"] = n
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog WHERE send_ready=true")
		out["send_ready"] = n
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog WHERE canonical_url_alive=false")
		out["dead_urls"] = n
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog WHERE quality_score IS NULL")
		out["unscored"] = n
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog WHERE cached_image_path IS NOT NULL")
		out["images_cached"] = n

		type srcCount struct {
			SourceID string `db:"source_id" json:"source_id"`
			N        int    `db:"n" json:"n"`
		}
		var bySource []srcCount
		_ = db.SelectContext(r.Context(), &bySource, "SELECT source_id, COUNT(*) AS n FROM catalog GROUP BY source_id ORDER BY n DESC")
		if bySource == nil {
			bySource = []srcCount{}
		}
		out["by_source"] = bySource

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out) //nolint:errcheck
	}
}

// joinAnd concatena partes com " AND " — helper local para este handler.
func joinAnd(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " AND "
		}
		out += p
	}
	return out
}
