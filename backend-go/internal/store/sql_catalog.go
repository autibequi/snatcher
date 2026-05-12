package store

import (
	crand "crypto/rand"
	"database/sql"
	"fmt"
	"snatcher/backendv2/internal/models"
	"time"

	"github.com/jmoiron/sqlx"
)

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

func (s *SQLStore) ListCatalogProducts(limit, offset int, includeInactive bool) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	q := `SELECT * FROM catalogproduct`
	if !includeInactive {
		q += ` WHERE inactive = FALSE`
	}
	q += ` ORDER BY updated_at DESC LIMIT $1 OFFSET $2`
	err := s.db.Select(&out, q, limit, offset)
	return out, err
}

const catalogScanLimitMax = 2000

// ListCatalogProductsAfterCursor lista por id ASC para varrer o catálogo sem ficar preso nos últimos updated_at.
// Quando afterID > 0 e não há linhas, faz uma segunda tentativa com afterID = 0 (wrap).
func (s *SQLStore) ListCatalogProductsAfterCursor(limit int, afterID int64, includeInactive bool) ([]models.CatalogProduct, error) {
	if limit <= 0 {
		limit = 500
	}
	if limit > catalogScanLimitMax {
		limit = catalogScanLimitMax
	}
	out, err := s.listCatalogProductsAfterCursorOnce(limit, afterID, includeInactive)
	if err != nil {
		return nil, err
	}
	if len(out) == 0 && afterID > 0 {
		out, err = s.listCatalogProductsAfterCursorOnce(limit, 0, includeInactive)
	}
	return out, err
}

func (s *SQLStore) listCatalogProductsAfterCursorOnce(limit int, afterID int64, includeInactive bool) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	q := `SELECT * FROM catalogproduct WHERE id > $1`
	if !includeInactive {
		q += ` AND inactive = FALSE`
	}
	q += ` ORDER BY id ASC LIMIT $2`
	err := s.db.Select(&out, q, afterID, limit)
	return out, err
}

// ListCatalogProductsForHeuristicBatch produtos pending ou incompletos (mesma regra que AutoHeuristic), por id ASC.
func (s *SQLStore) ListCatalogProductsForHeuristicBatch(afterID int64, limit int) ([]models.CatalogProduct, error) {
	if limit <= 0 {
		limit = 500
	}
	if limit > catalogScanLimitMax {
		limit = catalogScanLimitMax
	}
	out, err := s.listHeuristicBatchOnce(afterID, limit)
	if err != nil {
		return nil, err
	}
	if len(out) == 0 && afterID > 0 {
		out, err = s.listHeuristicBatchOnce(0, limit)
	}
	return out, err
}

func (s *SQLStore) listHeuristicBatchOnce(afterID int64, limit int) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	err := s.db.Select(&out, `
		SELECT * FROM catalogproduct
		WHERE id > $1
		  AND curation_status != 'rejected'
		  AND (
		    curation_status = 'pending'
		    OR (brand IS NULL OR brand = '')
		    OR tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0
		  )
		ORDER BY id ASC
		LIMIT $2`, afterID, limit)
	return out, err
}

// SetAutoMatchProductCursor persiste o cursor do ciclo de auto-match (justiça entre produtos).
func (s *SQLStore) SetAutoMatchProductCursor(cursor int64) error {
	_, err := s.db.Exec(`UPDATE appconfig SET auto_match_product_cursor = $1 WHERE id = 1`, cursor)
	return err
}

// SetCurationHeuristicCheckpoint marca último batch heurístico (worker agendado).
func (s *SQLStore) SetCurationHeuristicCheckpoint(at time.Time, lastProductID int64) error {
	_, err := s.db.Exec(`
		UPDATE appconfig SET curation_heuristic_last_run_at = $1, curation_heuristic_last_id = $2 WHERE id = 1`,
		at, lastProductID)
	return err
}

// DeactivateCatalogProductsWithoutPrice marca inactive produtos sem preço (>0).
func (s *SQLStore) DeactivateCatalogProductsWithoutPrice() (int64, error) {
	res, err := s.db.Exec(`
		UPDATE catalogproduct SET inactive = true
		WHERE inactive = false
		  AND (lowest_price IS NULL OR lowest_price <= 0)`)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return n, err
}

func (s *SQLStore) SearchCatalogProducts(q string, limit int) ([]models.CatalogProduct, error) {
	if limit <= 0 {
		limit = 10
	}
	var out []models.CatalogProduct
	pattern := "%" + q + "%"
	err := s.db.Select(&out,
		`SELECT * FROM catalogproduct
		 WHERE canonical_name ILIKE $1 OR tags::text ILIKE $1 OR brand ILIKE $1
		 ORDER BY updated_at DESC LIMIT $2`, pattern, limit)
	return out, err
}

func (s *SQLStore) CountCatalogProducts() (int64, error) {
	var count int64
	err := s.db.Get(&count, `SELECT COUNT(*) FROM catalogproduct`)
	return count, err
}

func (s *SQLStore) GetCatalogProduct(id int64) (models.CatalogProduct, error) {
	var p models.CatalogProduct
	err := s.db.Get(&p, `SELECT * FROM catalogproduct WHERE id = $1`, id)
	return p, err
}

func (s *SQLStore) CreateCatalogProduct(p models.CatalogProduct) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO catalogproduct (canonical_name, brand, weight, image_url, lowest_price,
			lowest_price_url, lowest_price_source, tags, quantity)
		VALUES (:canonical_name, :brand, :weight, :image_url, :lowest_price,
			:lowest_price_url, :lowest_price_source, :tags, :quantity)`, p)
}

func (s *SQLStore) UpdateCatalogProduct(p models.CatalogProduct) error {
	p.UpdatedAt = time.Now()
	_, err := s.db.NamedExec(`
		UPDATE catalogproduct SET canonical_name=:canonical_name, brand=:brand, weight=:weight,
			image_url=:image_url, lowest_price=:lowest_price, lowest_price_url=:lowest_price_url,
			lowest_price_source=:lowest_price_source, tags=:tags, updated_at=:updated_at,
			curation_status=:curation_status, quantity=:quantity,
			inspected=:inspected, inspected_at=:inspected_at, inspection_notes=:inspection_notes
		WHERE id = :id`, p)
	return err
}

func (s *SQLStore) DeleteCatalogProduct(id int64) error {
	_, err := s.db.Exec(`DELETE FROM catalogproduct WHERE id = $1`, id)
	return err
}

func (s *SQLStore) GetVariantByURL(url string) (models.CatalogVariant, bool, error) {
	var v models.CatalogVariant
	err := s.db.Get(&v, `SELECT * FROM catalogvariant WHERE url = $1 LIMIT 1`, url)
	if err == sql.ErrNoRows {
		return v, false, nil
	}
	return v, err == nil, err
}

func (s *SQLStore) CreateCatalogVariant(v models.CatalogVariant) (int64, error) {
	// Gera short_id se não tiver
	if !v.ShortID.Valid || v.ShortID.String == "" {
		v.ShortID = models.NullString{NullString: sql.NullString{String: genShortID(), Valid: true}}
	}
	if len(v.Metadata) == 0 {
		v.Metadata = []byte("{}")
	}
	return insertReturningID(s.db, `
		INSERT INTO catalogvariant (catalog_product_id, title, variant_label, price, url, short_id, image_url, source, match_confidence, match_method, metadata)
		VALUES (:catalog_product_id, :title, :variant_label, :price, :url, :short_id, :image_url, :source, :match_confidence, :match_method, :metadata)`, v)
}

func (s *SQLStore) GetShortIDByURL(url string) string {
	var shortID string
	_ = s.db.Get(&shortID, `SELECT COALESCE(short_id,'') FROM catalogvariant WHERE url = $1 LIMIT 1`, url)
	if shortID != "" {
		return shortID
	}
	// Gera e persiste on-demand
	shortID = genShortID()
	_, _ = s.db.Exec(`UPDATE catalogvariant SET short_id = $1 WHERE url = $2 AND (short_id IS NULL OR short_id = '')`, shortID, url)
	return shortID
}

// GetOrCreateShortLink retorna short_id para destURL, criando se não existir.
func (s *SQLStore) GetOrCreateShortLink(destURL, source string) (string, error) {
	var sid string
	err := s.db.Get(&sid, `SELECT short_id FROM short_links WHERE dest_url = $1 LIMIT 1`, destURL)
	if err == nil {
		return sid, nil
	}
	sid = genShortID()
	_, _ = s.db.Exec(`INSERT INTO short_links (short_id, dest_url, source) VALUES ($1, $2, $3) ON CONFLICT (dest_url) DO NOTHING`,
		sid, destURL, source)
	// Re-busca para pegar o sid real (pode ter perdido a corrida)
	_ = s.db.Get(&sid, `SELECT short_id FROM short_links WHERE dest_url = $1 LIMIT 1`, destURL)
	if sid == "" {
		return "", fmt.Errorf("short link not found after insert")
	}
	return sid, nil
}

func (s *SQLStore) PeekShortLinkByID(shortID string) (destURL string, source string, found bool) {
	var row struct {
		DestURL string `db:"dest_url"`
		Source  string `db:"source"`
	}
	if err := s.db.Get(&row, `SELECT dest_url, source FROM short_links WHERE short_id = $1`, shortID); err != nil {
		return "", "", false
	}
	return row.DestURL, row.Source, true
}

func (s *SQLStore) IncrementShortLinkClickCount(shortID string) {
	_, _ = s.db.Exec(`UPDATE short_links SET click_count = click_count + 1 WHERE short_id = $1`, shortID)
}

func (s *SQLStore) GetShortLinkByID(shortID string) (destURL string, source string, found bool) {
	dest, src, ok := s.PeekShortLinkByID(shortID)
	if !ok {
		return "", "", false
	}
	s.IncrementShortLinkClickCount(shortID)
	return dest, src, true
}

func (s *SQLStore) GetVariantByShortID(shortID string) (models.CatalogVariant, bool, error) {
	var v models.CatalogVariant
	err := s.db.Get(&v, `SELECT * FROM catalogvariant WHERE short_id = $1 LIMIT 1`, shortID)
	if err == sql.ErrNoRows {
		return v, false, nil
	}
	return v, err == nil, err
}

func (s *SQLStore) GetCatalogVariant(id int64) (models.CatalogVariant, error) {
	var v models.CatalogVariant
	err := s.db.Get(&v, `SELECT * FROM catalogvariant WHERE id = $1 LIMIT 1`, id)
	return v, err
}

func genShortID() string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	raw := make([]byte, 7)
	_, _ = crand.Read(raw)
	b := make([]byte, 7)
	for i, r := range raw {
		b[i] = chars[int(r)%len(chars)]
	}
	return string(b)
}

func (s *SQLStore) UpdateCatalogVariant(v models.CatalogVariant) error {
	v.LastSeenAt = time.Now()
	if len(v.Metadata) == 0 {
		v.Metadata = []byte("{}")
	}
	_, err := s.db.NamedExec(`
		UPDATE catalogvariant SET price=:price, last_seen_at=:last_seen_at, metadata=:metadata
		WHERE id = :id`, v)
	return err
}

func (s *SQLStore) ListVariantsByProduct(productID int64) ([]models.CatalogVariant, error) {
	var out []models.CatalogVariant
	err := s.db.Select(&out,
		`SELECT * FROM catalogvariant WHERE catalog_product_id = $1 ORDER BY price`, productID)
	return out, err
}

// HydrateVariantPricesFromHistory copia o último preço registrado quando variant.price está zerado.
func (s *SQLStore) HydrateVariantPricesFromHistory(variants []models.CatalogVariant) error {
	if len(variants) == 0 {
		return nil
	}
	need := make([]int64, 0)
	idx := make(map[int64]int)
	for i := range variants {
		id := variants[i].ID
		if id == 0 || variants[i].Price > 0 {
			continue
		}
		need = append(need, id)
		idx[id] = i
	}
	if len(need) == 0 {
		return nil
	}
	query, args, err := sqlx.In(`
		SELECT DISTINCT ON (variant_id) variant_id, price
		FROM pricehistoryv2
		WHERE variant_id IN (?)
		ORDER BY variant_id, recorded_at DESC`, need)
	if err != nil {
		return err
	}
	query = s.db.Rebind(query)
	var rows []struct {
		VariantID int64   `db:"variant_id"`
		Price     float64 `db:"price"`
	}
	if err := s.db.Select(&rows, query, args...); err != nil {
		return err
	}
	for _, r := range rows {
		if i, ok := idx[r.VariantID]; ok && r.Price > 0 {
			variants[i].Price = r.Price
		}
	}
	return nil
}

func (s *SQLStore) InsertPriceHistoryV2(h models.PriceHistoryV2) error {
	_, err := s.db.NamedExec(`
		INSERT INTO pricehistoryv2 (variant_id, price) VALUES (:variant_id, :price)`, h)
	return err
}

func (s *SQLStore) ListPriceHistoryV2(variantID int64) ([]models.PriceHistoryV2, error) {
	var out []models.PriceHistoryV2
	err := s.db.Select(&out,
		`SELECT * FROM pricehistoryv2 WHERE variant_id = $1 ORDER BY recorded_at DESC LIMIT 100`, variantID)
	return out, err
}

// GetVariantStats calculates price statistics (percentiles, mean, score) for a variant over a time window.
// Returns nil if variant has no prices in the window.
func (s *SQLStore) GetVariantStats(variantID int64, windowDays int) (*models.VariantStats, error) {
	// Get current price (most recent)
	var currentPrice sql.NullFloat64
	var currentTime sql.NullTime
	err := s.db.QueryRow(`
		SELECT price, recorded_at
		FROM pricehistoryv2
		WHERE variant_id = $1
		ORDER BY recorded_at DESC
		LIMIT 1
	`, variantID).Scan(&currentPrice, &currentTime)

	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == sql.ErrNoRows || !currentPrice.Valid {
		return nil, nil // No data for this variant
	}

	// Build window filter
	windowSQL := fmt.Sprintf("AND recorded_at >= NOW() - INTERVAL '%d days'", windowDays)

	// Fetch all prices in window for manual percentile calculation (supports both SQLite and Postgres)
	var prices []float64
	rows, err := s.db.Query(`
		SELECT price
		FROM pricehistoryv2
		WHERE variant_id = $1 `+windowSQL+`
		ORDER BY price ASC
	`, variantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var p float64
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		prices = append(prices, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Check if we have enough data
	if len(prices) == 0 {
		return nil, nil
	}

	// Apply IQR cleanup (remove outliers)
	cleanedPrices := applyIQRCleanup(prices)

	// If after cleanup we don't have enough data, return null score
	if len(cleanedPrices) < 5 {
		window := fmt.Sprintf("%dd", windowDays)
		reason := "insufficient_data"
		return &models.VariantStats{
			Count:  len(prices),
			Window: window,
			Score:  nil,
			Reason: &reason,
		}, nil
	}

	// Calculate percentiles and mean from cleaned data
	p25 := percentile(cleanedPrices, 0.25)
	p50 := percentile(cleanedPrices, 0.50)
	p75 := percentile(cleanedPrices, 0.75)
	mean := calculateMean(cleanedPrices)

	// Calculate score
	var score *float64
	var reason *string
	if p75 == p25 {
		// No variance
		noVar := "no_variance"
		reason = &noVar
		score = nil
	} else {
		// score = clamp((p75 - current) / (p75 - p25), 0, 1)
		s := (p75 - currentPrice.Float64) / (p75 - p25)
		if s < 0 {
			s = 0
		} else if s > 1 {
			s = 1
		}
		score = &s
	}

	window := fmt.Sprintf("%dd", windowDays)
	return &models.VariantStats{
		P25:     p25,
		P50:     p50,
		P75:     p75,
		Mean:    mean,
		Current: currentPrice.Float64,
		Score:   score,
		Count:   len(cleanedPrices),
		Window:  window,
		Reason:  reason,
	}, nil
}

// Helper: apply IQR cleanup to remove outliers
func applyIQRCleanup(prices []float64) []float64 {
	if len(prices) < 5 {
		return prices
	}

	q1 := percentile(prices, 0.25)
	q3 := percentile(prices, 0.75)
	iqr := q3 - q1

	lower := q1 - 1.5*iqr
	upper := q3 + 1.5*iqr

	var cleaned []float64
	for _, p := range prices {
		if p >= lower && p <= upper {
			cleaned = append(cleaned, p)
		}
	}
	return cleaned
}

// Helper: calculate percentile (assumes sorted array)
func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}

	idx := p * float64(len(sorted)-1)
	lower := int(idx)
	upper := lower + 1
	weight := idx - float64(lower)

	if upper >= len(sorted) {
		return sorted[lower]
	}

	return sorted[lower]*(1-weight) + sorted[upper]*weight
}

// Helper: calculate mean
func calculateMean(prices []float64) float64 {
	if len(prices) == 0 {
		return 0
	}
	sum := 0.0
	for _, p := range prices {
		sum += p
	}
	return sum / float64(len(prices))
}

func (s *SQLStore) ListGroupingKeywords() ([]models.GroupingKeyword, error) {
	var out []models.GroupingKeyword
	err := s.db.Select(&out, `SELECT * FROM groupingkeyword WHERE active = 1 ORDER BY keyword`)
	return out, err
}

func (s *SQLStore) CreateGroupingKeyword(k models.GroupingKeyword) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO groupingkeyword (keyword, tag, active) VALUES (:keyword, :tag, :active)`, k)
}

func (s *SQLStore) UpdateGroupingKeyword(k models.GroupingKeyword) error {
	_, err := s.db.NamedExec(`
		UPDATE groupingkeyword SET keyword=:keyword, tag=:tag, active=:active WHERE id = :id`, k)
	return err
}

func (s *SQLStore) DeleteGroupingKeyword(id int64) error {
	_, err := s.db.Exec(`DELETE FROM groupingkeyword WHERE id = $1`, id)
	return err
}

func (s *SQLStore) GetRecentlyUpdatedProducts(since time.Time) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	err := s.db.Select(&out,
		`SELECT * FROM catalogproduct WHERE updated_at >= $1 ORDER BY updated_at DESC`, since)
	return out, err
}

// ---------------------------------------------------------------------------
// Pipeline canônico v2 — raw_items / discarded_items
// ---------------------------------------------------------------------------

// InsertRawItem grava o CrawlResult em raw_items resolvendo source_id via sources.id.
// Tolerante a erro — nunca bloqueia o fluxo principal.
func (s *SQLStore) InsertRawItem(r models.CrawlResult, payload []byte) error {
	_, err := s.db.Exec(`
		INSERT INTO raw_items (source_id, payload, crawled_at, processed)
		SELECT s.id, $1, now(), false
		FROM sources s WHERE s.id = $2
		LIMIT 1
	`, payload, r.Source)
	return err
}

// InsertDiscardedItem grava o CrawlResult em discarded_items com o motivo da rejeição.
// Tolerante a erro — nunca bloqueia o fluxo principal.
func (s *SQLStore) InsertDiscardedItem(r models.CrawlResult, payload []byte, reason string) error {
	_, err := s.db.Exec(`
		INSERT INTO discarded_items (source_id, reason, payload, discarded_at)
		SELECT s.id, $1, $2, now()
		FROM sources s WHERE s.id = $3
		LIMIT 1
	`, reason, payload, r.Source)
	return err
}
