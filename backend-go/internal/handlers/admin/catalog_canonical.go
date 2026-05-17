package admin

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/services/jobs"
	"snatcher/backendv2/internal/services/llm"
)

// GET /api/admin/catalog-canonical?ready_only=1&incomplete_enrichment=1&category_id=N&limit=50&offset=0
func ListCatalogCanonicalHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		readyOnly := r.URL.Query().Get("ready_only") == "1"
		incompleteEnrichment := r.URL.Query().Get("incomplete_enrichment") == "1"
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
			where = append(where, "(c.send_ready = true OR c.catalog_status = 'ready') AND c.canonical_url_alive = true")
		}
		if incompleteEnrichment {
			// Mesmo critério da fila LLM: precisa marca (texto), brand_id e categoria para sair do pipeline.
			where = append(where, `c.title IS NOT NULL AND btrim(c.title) <> ''
				AND (
					c.brand IS NULL OR btrim(c.brand) = ''
					OR c.category_id IS NULL
					OR c.brand_id IS NULL
				)`)
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
		if bslug := r.URL.Query().Get("brand_slug"); bslug != "" {
			where = append(where, "c.brand = $"+strconv.Itoa(i))
			args = append(args, bslug)
			i++
		} else if brand := r.URL.Query().Get("brand"); brand != "" {
			where = append(where, "LOWER(COALESCE(c.brand,'')) ILIKE $"+strconv.Itoa(i))
			args = append(args, "%"+strings.ToLower(brand)+"%")
			i++
		}
		if pMin := r.URL.Query().Get("price_min"); pMin != "" {
			if v, err := strconv.ParseFloat(pMin, 64); err == nil {
				where = append(where, "c.price_current >= $"+strconv.Itoa(i))
				args = append(args, v)
				i++
			}
		}
		if pMax := r.URL.Query().Get("price_max"); pMax != "" {
			if v, err := strconv.ParseFloat(pMax, 64); err == nil {
				where = append(where, "c.price_current <= $"+strconv.Itoa(i))
				args = append(args, v)
				i++
			}
		}
		args = append(args, limit, offset)
		q := `
			SELECT c.id, c.short_id, c.dedup_key, c.source_id, c.category_id,
			       ct.display_name AS category_name,
			       c.brand AS brand_slug,
			       COALESCE(NULLIF(pb.display_name, ''), c.brand) AS brand,
			       c.title, c.image_url, c.price_original, c.price_current, c.discount_pct,
			       c.quality_score, c.send_ready, c.catalog_status, c.canonical_url_alive, c.canonical_url,
			       c.created_at::text AS created_at, c.send_ready_at::text AS send_ready_at
			FROM catalog c
			LEFT JOIN categories ct ON ct.id = c.category_id
			LEFT JOIN product_brands pb ON pb.id = c.brand_id
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
			BrandSlug         *string  `db:"brand_slug" json:"brand_slug,omitempty"`
			Brand             *string  `db:"brand" json:"brand,omitempty"`
			Title             string   `db:"title" json:"title"`
			ImageURL          *string  `db:"image_url" json:"image_url,omitempty"`
			PriceOriginal     *float64 `db:"price_original" json:"price_original,omitempty"`
			PriceCurrent      float64  `db:"price_current" json:"price_current"`
			DiscountPct       *float64 `db:"discount_pct" json:"discount_pct,omitempty"`
			QualityScore      *float64 `db:"quality_score" json:"quality_score,omitempty"`
			SendReady         bool     `db:"send_ready" json:"send_ready"`
			CatalogStatus     *string  `db:"catalog_status" json:"catalog_status,omitempty"`
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
		json.NewEncoder(w).Encode(rows) //nolint:errcheck
	}
}

// GET /api/admin/catalog-canonical/llm-queue?status=active|all|pending|processing|done|error&limit=100
func ListCatalogLLMQueueHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		statusFilter := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))
		if statusFilter == "" {
			statusFilter = "active"
		}
		limit := 100
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 500 {
			limit = v
		}

		whereStatus := ""
		args := []any{}
		switch statusFilter {
		case "active":
			whereStatus = "q.status IN ('pending', 'processing', 'error')"
		case "all":
			whereStatus = "TRUE"
		case "pending", "processing", "done", "error":
			whereStatus = "q.status = $1"
			args = append(args, statusFilter)
		default:
			http.Error(w, "invalid status (use active, all, pending, processing, done, error)", http.StatusBadRequest)
			return
		}

		argN := len(args) + 1
		args = append(args, limit)

		q := `
			SELECT q.catalog_id, q.status, q.reason,
			       q.enqueued_at::text AS enqueued_at, q.processed_at::text AS processed_at, q.last_error,
			       c.title, c.source_id,
			       ct.display_name AS category_name
			FROM catalog_llm_queue q
			INNER JOIN catalog c ON c.id = q.catalog_id
			LEFT JOIN categories ct ON ct.id = c.category_id
			WHERE ` + whereStatus + `
			ORDER BY q.enqueued_at DESC
			LIMIT $` + strconv.Itoa(argN)

		type row struct {
			CatalogID    int64   `db:"catalog_id" json:"catalog_id"`
			Status       string  `db:"status" json:"status"`
			Reason       *string `db:"reason" json:"reason,omitempty"`
			EnqueuedAt   string  `db:"enqueued_at" json:"enqueued_at"`
			ProcessedAt  *string `db:"processed_at" json:"processed_at,omitempty"`
			LastError    *string `db:"last_error" json:"last_error,omitempty"`
			Title        string  `db:"title" json:"title"`
			SourceID     string  `db:"source_id" json:"source_id"`
			CategoryName *string `db:"category_name" json:"category_name,omitempty"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, q, args...); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
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
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog_llm_queue WHERE status = 'pending'")
		out["llm_queue_pending"] = n
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog_llm_queue WHERE status = 'processing'")
		out["llm_queue_processing"] = n
		_ = db.GetContext(r.Context(), &n, "SELECT COUNT(*) FROM catalog_llm_queue WHERE status = 'error'")
		out["llm_queue_error"] = n
		_ = db.GetContext(r.Context(), &n, `
			SELECT COUNT(*) FROM catalog c
			WHERE c.title IS NOT NULL AND btrim(c.title) <> ''
			  AND (
			    c.brand IS NULL OR btrim(c.brand) = ''
			    OR c.category_id IS NULL
			    OR c.brand_id IS NULL
			  )
		`)
		out["catalog_incomplete_enrichment"] = n

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

// GET /api/admin/catalog/{id}/price-history?limit=60
func CatalogPriceHistoryHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		idStr := chi.URLParam(r, "id")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || id <= 0 {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		limit := 60
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 500 {
			limit = v
		}
		type row struct {
			Price  float64 `db:"price" json:"price"`
			SeenAt string  `db:"seen_at" json:"seen_at"`
		}
		var rows []row
		if err := db.SelectContext(r.Context(), &rows, `
			SELECT price::float8 AS price, seen_at::text AS seen_at
			FROM price_history
			WHERE catalog_id = $1
			ORDER BY seen_at DESC
			LIMIT $2
		`, id, limit); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []row{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rows) //nolint:errcheck
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

// GET /api/admin/product-brands?q=&limit=30
func ListProductBrandsHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 30
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 100 {
			limit = v
		}
		type brow struct {
			ID          int64  `db:"id" json:"id"`
			Slug        string `db:"slug" json:"slug"`
			DisplayName string `db:"display_name" json:"display_name"`
		}
		var rows []brow
		var err error
		like := "%" + q + "%"
		if q == "" {
			err = db.SelectContext(r.Context(), &rows,
				`SELECT id, slug, display_name FROM product_brands ORDER BY display_name ASC LIMIT $1`, limit)
		} else {
			err = db.SelectContext(r.Context(), &rows,
				`SELECT id, slug, display_name FROM product_brands
				 WHERE slug ILIKE $1 OR display_name ILIKE $1
				 ORDER BY display_name ASC LIMIT $2`,
				like, limit)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if rows == nil {
			rows = []brow{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rows) //nolint:errcheck
	}
}

// POST /api/admin/catalog-canonical/reprocess-heuristic — só eurística (sem LLM); atualiza fila LLM.
func ReprocessCatalogHeuristicHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		ctx := r.Context()
		tx, err := db.BeginTxx(ctx, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer func() { _ = tx.Rollback() }()

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO product_brands (slug, display_name)
			SELECT brand_slug, MAX(brand_display) FROM brand_keywords GROUP BY brand_slug
			ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
		`); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		res, err := tx.ExecContext(ctx, `
			WITH x AS (
				SELECT
					c.id,
					b.bslug,
					CASE WHEN b.bslug IS NOT NULL
						THEN classify_catalog_category(c.title, COALESCE(c.source_id::text, ''))
						ELSE NULL END AS cid
				FROM catalog c
				CROSS JOIN LATERAL (SELECT classify_catalog_brand(c.title) AS bslug) b
				WHERE c.title IS NOT NULL AND btrim(c.title) <> ''
			)
			UPDATE catalog c SET
				brand = x.bslug,
				brand_id = pb.id,
				category_id = x.cid,
				updated_at = now()
			FROM x
			LEFT JOIN product_brands pb ON pb.slug = x.bslug
			WHERE c.id = x.id
		`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		nUpd, _ := res.RowsAffected()

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO product_brands (slug, display_name)
			SELECT DISTINCT brand, brand FROM catalog WHERE brand IS NOT NULL AND btrim(brand) <> ''
			ON CONFLICT (slug) DO NOTHING
		`); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if _, err := tx.ExecContext(ctx, `
			UPDATE catalog c SET brand_id = pb.id
			FROM product_brands pb
			WHERE c.brand = pb.slug AND (c.brand_id IS NULL OR c.brand_id <> pb.id)
		`); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if _, err := tx.ExecContext(ctx, `
			DELETE FROM catalog_llm_queue q
			USING catalog c
			WHERE q.catalog_id = c.id
			  AND c.brand IS NOT NULL AND btrim(c.brand) <> ''
			  AND c.category_id IS NOT NULL
			  AND c.brand_id IS NOT NULL
		`); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if _, err := tx.ExecContext(ctx, `
			INSERT INTO catalog_llm_queue (catalog_id, status, reason)
			SELECT id, 'pending',
				CASE
					WHEN brand IS NULL OR btrim(brand) = '' THEN 'no_brand_keyword_match'
					WHEN category_id IS NULL THEN 'no_category_keyword_match'
					ELSE 'no_brand_id_match'
				END
			FROM catalog
			WHERE title IS NOT NULL AND btrim(title) <> ''
			  AND (
			    brand IS NULL OR btrim(brand) = ''
			    OR category_id IS NULL
			    OR brand_id IS NULL
			  )
			ON CONFLICT (catalog_id) DO UPDATE SET
				status = 'pending',
				reason = EXCLUDED.reason,
				enqueued_at = CASE
					WHEN catalog_llm_queue.status = 'pending' THEN catalog_llm_queue.enqueued_at
					ELSE now()
				END,
				processed_at = NULL,
				last_error = NULL
		`); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var qPending, qProcessing, qError int
		_ = tx.GetContext(ctx, &qPending, `SELECT COUNT(*) FROM catalog_llm_queue WHERE status = 'pending'`)
		_ = tx.GetContext(ctx, &qProcessing, `SELECT COUNT(*) FROM catalog_llm_queue WHERE status = 'processing'`)
		_ = tx.GetContext(ctx, &qError, `SELECT COUNT(*) FROM catalog_llm_queue WHERE status = 'error'`)

		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{ //nolint:errcheck
			"updated_rows":           nUpd,
			"llm_queue_pending":      qPending,
			"llm_queue_processing":   qProcessing,
			"llm_queue_error":        qError,
		})
	}
}

// POST /api/admin/catalog-llm-queue/process-next — processa 1 item (eurística + LLM se necessário).
func ProcessCatalogLLMQueueNextHandler(db *sqlx.DB, llmFactory func() llm.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		out, err := jobs.RunCatalogLLMQueueOnce(r.Context(), db, llmFactory)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out) //nolint:errcheck
	}
}
