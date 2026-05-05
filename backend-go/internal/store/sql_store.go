package store

import (
	crand "crypto/rand"
	"database/sql"
	"fmt"
	"snatcher/backendv2/internal/models"
	"time"

	"github.com/jmoiron/sqlx"
)

type SQLStore struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) Store {
	return &SQLStore{db: db}
}

// insertReturningID executa um NamedExec com RETURNING id para compatibilidade Postgres.
// Substitui o padrão res.LastInsertId() que não funciona no driver pq.
func insertReturningID(db *sqlx.DB, query string, arg interface{}) (int64, error) {
	query = query + " RETURNING id"
	rows, err := sqlx.NamedQuery(db, query, arg)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var id int64
	if rows.Next() {
		if err := rows.Scan(&id); err != nil {
			return 0, err
		}
	}
	return id, nil
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

func (s *SQLStore) GetConfig() (models.AppConfig, error) {
	var c models.AppConfig
	err := s.db.Get(&c, `SELECT * FROM appconfig WHERE id = 1`)
	return c, err
}

func (s *SQLStore) UpdateConfig(cfg models.AppConfig) error {
	_, err := s.db.NamedExec(`
		UPDATE appconfig SET
			wa_provider=:wa_provider, wa_base_url=:wa_base_url, wa_api_key=:wa_api_key,
			wa_instance=:wa_instance, global_interval=:global_interval,
			send_start_hour=:send_start_hour, send_end_hour=:send_end_hour,
			ml_client_id=:ml_client_id, ml_client_secret=:ml_client_secret,
			wa_group_prefix=:wa_group_prefix, alert_phone=:alert_phone,
			use_short_links=:use_short_links, tg_enabled=:tg_enabled,
			tg_bot_token=:tg_bot_token, tg_bot_username=:tg_bot_username,
			tg_group_prefix=:tg_group_prefix, tg_last_update_id=:tg_last_update_id
		WHERE id = 1`, cfg)
	return err
}

func (s *SQLStore) ListWAAccounts() ([]models.WAAccount, error) {
	var out []models.WAAccount
	err := s.db.Select(&out, `SELECT * FROM waaccount ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetWAAccount(id int64) (models.WAAccount, error) {
	var a models.WAAccount
	err := s.db.Get(&a, `SELECT * FROM waaccount WHERE id = $1`, id)
	return a, err
}

func (s *SQLStore) CreateWAAccount(a models.WAAccount) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO waaccount (name, provider, base_url, api_key, instance, group_prefix, status, active)
		VALUES (:name, :provider, :base_url, :api_key, :instance, :group_prefix, :status, :active)`, a)
}

func (s *SQLStore) UpdateWAAccount(a models.WAAccount) error {
	_, err := s.db.NamedExec(`
		UPDATE waaccount SET name=:name, provider=:provider, base_url=:base_url,
			api_key=:api_key, instance=:instance, group_prefix=:group_prefix,
			status=:status, active=:active
		WHERE id = :id`, a)
	return err
}

func (s *SQLStore) DeleteWAAccount(id int64) error {
	_, err := s.db.Exec(`DELETE FROM waaccount WHERE id = $1`, id)
	return err
}

func (s *SQLStore) ListTGAccounts() ([]models.TGAccount, error) {
	var out []models.TGAccount
	err := s.db.Select(&out, `SELECT * FROM tgaccount ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetTGAccount(id int64) (models.TGAccount, error) {
	var a models.TGAccount
	err := s.db.Get(&a, `SELECT * FROM tgaccount WHERE id = $1`, id)
	return a, err
}

func (s *SQLStore) CreateTGAccount(a models.TGAccount) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO tgaccount (name, bot_token, bot_username, group_prefix, active)
		VALUES (:name, :bot_token, :bot_username, :group_prefix, :active)`, a)
}

func (s *SQLStore) UpdateTGAccount(a models.TGAccount) error {
	_, err := s.db.NamedExec(`
		UPDATE tgaccount SET name=:name, bot_token=:bot_token, bot_username=:bot_username,
			group_prefix=:group_prefix, last_update_id=:last_update_id, active=:active
		WHERE id = :id`, a)
	return err
}

func (s *SQLStore) DeleteTGAccount(id int64) error {
	_, err := s.db.Exec(`DELETE FROM tgaccount WHERE id = $1`, id)
	return err
}

// ---------------------------------------------------------------------------
// SearchTerms
// ---------------------------------------------------------------------------

func (s *SQLStore) ListSearchTerms() ([]models.SearchTerm, error) {
	var out []models.SearchTerm
	err := s.db.Select(&out, `SELECT * FROM searchterm ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetSearchTerm(id int64) (models.SearchTerm, error) {
	var t models.SearchTerm
	err := s.db.Get(&t, `SELECT * FROM searchterm WHERE id = $1`, id)
	return t, err
}

func (s *SQLStore) CreateSearchTerm(t models.SearchTerm) (int64, error) {
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		t.Query, t.Queries, t.MinVal, t.MaxVal, t.Sources, t.Category, t.Active, t.CrawlInterval,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateSearchTerm(t models.SearchTerm) error {
	_, err := s.db.Exec(`
		UPDATE searchterm SET query=$1, queries=$2, min_val=$3, max_val=$4,
			sources=$5, category=$6, active=$7, crawl_interval=$8
		WHERE id = $9`,
		t.Query, t.Queries, t.MinVal, t.MaxVal, t.Sources, t.Category, t.Active, t.CrawlInterval, t.ID,
	)
	return err
}

func (s *SQLStore) DeleteSearchTerm(id int64) error {
	_, err := s.db.Exec(`DELETE FROM searchterm WHERE id = $1`, id)
	return err
}

func (s *SQLStore) TouchSearchTerm(id int64, count int) error {
	_, err := s.db.Exec(`
		UPDATE searchterm SET last_crawled_at = CURRENT_TIMESTAMP, result_count = result_count + $1
		WHERE id = $2`, count, id)
	return err
}

// ---------------------------------------------------------------------------
// CrawlResults
// ---------------------------------------------------------------------------

func (s *SQLStore) InsertCrawlResult(r models.CrawlResult) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO crawlresult (search_term_id, title, price, url, image_url, source, source_subid)
		VALUES (:search_term_id, :title, :price, :url, :image_url, :source, :source_subid)`, r)
}

func (s *SQLStore) ListCrawlResultsByTerm(termID int64, limit, offset int) ([]models.CrawlResult, error) {
	var out []models.CrawlResult
	err := s.db.Select(&out,
		`SELECT * FROM crawlresult WHERE search_term_id = $1 ORDER BY crawled_at DESC LIMIT $2 OFFSET $3`,
		termID, limit, offset)
	return out, err
}

func (s *SQLStore) CountCrawlResultsByTerm(termID int64) (int64, error) {
	var count int64
	err := s.db.Get(&count, `SELECT COUNT(*) FROM crawlresult WHERE search_term_id = $1`, termID)
	return count, err
}

func (s *SQLStore) ListUnprocessedCrawlResults() ([]models.CrawlResult, error) {
	var out []models.CrawlResult
	err := s.db.Select(&out, `SELECT * FROM crawlresult WHERE catalog_variant_id IS NULL ORDER BY id`)
	return out, err
}

func (s *SQLStore) MarkCrawlResultProcessed(id int64, variantID int64) error {
	_, err := s.db.Exec(`UPDATE crawlresult SET catalog_variant_id = $1 WHERE id = $2`, variantID, id)
	return err
}

func (s *SQLStore) URLAlreadyCrawled(searchTermID int64, url string) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM crawlresult WHERE search_term_id = $1 AND url = $2`, searchTermID, url)
	return count > 0, err
}

// ---------------------------------------------------------------------------
// CrawlLogs
// ---------------------------------------------------------------------------

func (s *SQLStore) InsertCrawlLog(l models.CrawlLog) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO crawllog (search_term_id, status, ml_count, amz_count)
		VALUES (:search_term_id, :status, :ml_count, :amz_count)`, l)
}

func (s *SQLStore) UpdateCrawlLog(l models.CrawlLog) error {
	_, err := s.db.NamedExec(`
		UPDATE crawllog SET finished_at=:finished_at, status=:status,
			ml_count=:ml_count, amz_count=:amz_count, error_msg=:error_msg
		WHERE id = :id`, l)
	return err
}

func (s *SQLStore) ListCrawlLogs(termID int64, limit int) ([]models.CrawlLog, error) {
	var out []models.CrawlLog
	var err error
	if termID > 0 {
		err = s.db.Select(&out,
			`SELECT * FROM crawllog WHERE search_term_id = $1 ORDER BY started_at DESC LIMIT $2`, termID, limit)
	} else {
		err = s.db.Select(&out,
			`SELECT * FROM crawllog ORDER BY started_at DESC LIMIT $1`, limit)
	}
	return out, err
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

func (s *SQLStore) ListCatalogProducts(limit, offset int) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	err := s.db.Select(&out,
		`SELECT * FROM catalogproduct ORDER BY updated_at DESC LIMIT $1 OFFSET $2`, limit, offset)
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
			lowest_price_url, lowest_price_source, tags)
		VALUES (:canonical_name, :brand, :weight, :image_url, :lowest_price,
			:lowest_price_url, :lowest_price_source, :tags)`, p)
}

func (s *SQLStore) UpdateCatalogProduct(p models.CatalogProduct) error {
	p.UpdatedAt = time.Now()
	_, err := s.db.NamedExec(`
		UPDATE catalogproduct SET canonical_name=:canonical_name, brand=:brand, weight=:weight,
			image_url=:image_url, lowest_price=:lowest_price, lowest_price_url=:lowest_price_url,
			lowest_price_source=:lowest_price_source, tags=:tags, updated_at=:updated_at
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
	return insertReturningID(s.db, `
		INSERT INTO catalogvariant (catalog_product_id, title, variant_label, price, url, short_id, image_url, source)
		VALUES (:catalog_product_id, :title, :variant_label, :price, :url, :short_id, :image_url, :source)`, v)
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
	_, err := s.db.NamedExec(`
		UPDATE catalogvariant SET price=:price, last_seen_at=:last_seen_at
		WHERE id = :id`, v)
	return err
}

func (s *SQLStore) ListVariantsByProduct(productID int64) ([]models.CatalogVariant, error) {
	var out []models.CatalogVariant
	err := s.db.Select(&out,
		`SELECT * FROM catalogvariant WHERE catalog_product_id = $1 ORDER BY price`, productID)
	return out, err
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
		P25:    p25,
		P50:    p50,
		P75:    p75,
		Mean:   mean,
		Current: currentPrice.Float64,
		Score:  score,
		Count:  len(cleanedPrices),
		Window: window,
		Reason: reason,
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
// Channels
// ---------------------------------------------------------------------------

func (s *SQLStore) listChannelsUnmarshal(out []models.Channel) []models.Channel {
	for i := range out {
		_ = out[i].UnmarshalAudience()
	}
	return out
}

func (s *SQLStore) ListChannels() ([]models.Channel, error) {
	var out []models.Channel
	err := s.db.Select(&out, `SELECT * FROM channel ORDER BY id`)
	if err != nil {
		return nil, err
	}
	return s.listChannelsUnmarshal(out), nil
}

func (s *SQLStore) GetChannel(id int64) (models.Channel, error) {
	var c models.Channel
	err := s.db.Get(&c, `SELECT * FROM channel WHERE id = $1`, id)
	if err != nil {
		return c, err
	}
	_ = c.UnmarshalAudience()
	return c, nil
}

func (s *SQLStore) GetChannelBySlug(slug string) (models.Channel, error) {
	var c models.Channel
	err := s.db.Get(&c, `SELECT * FROM channel WHERE slug = $1`, slug)
	if err != nil {
		return c, err
	}
	_ = c.UnmarshalAudience()
	return c, nil
}

func (s *SQLStore) CreateChannel(c models.Channel) (int64, error) {
	if err := c.MarshalAudience(); err != nil {
		return 0, err
	}
	return insertReturningID(s.db, `
		INSERT INTO channel (name, description, slug, message_template, send_start_hour, send_end_hour,
			digest_mode, digest_max_items, active, audience, member_count, ctr_30d, cvr_30d, revenue_30d)
		VALUES (:name, :description, :slug, :message_template, :send_start_hour, :send_end_hour,
			:digest_mode, :digest_max_items, :active, :audience, :member_count, :ctr_30d, :cvr_30d, :revenue_30d)`, c)
}

func (s *SQLStore) UpdateChannel(c models.Channel) error {
	if err := c.MarshalAudience(); err != nil {
		return err
	}
	_, err := s.db.NamedExec(`
		UPDATE channel SET name=:name, description=:description, slug=:slug,
			message_template=:message_template, send_start_hour=:send_start_hour,
			send_end_hour=:send_end_hour, digest_mode=:digest_mode,
			digest_max_items=:digest_max_items, active=:active,
			audience=:audience, member_count=:member_count,
			ctr_30d=:ctr_30d, cvr_30d=:cvr_30d, revenue_30d=:revenue_30d
		WHERE id = :id`, c)
	return err
}

func (s *SQLStore) DeleteChannel(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channel WHERE id = $1`, id)
	return err
}

// ListChannelsByCategory retorna canais ativos cuja audience contém a categoria via índice GIN.
func (s *SQLStore) ListChannelsByCategory(category string) ([]models.Channel, error) {
	rows := []models.Channel{}
	err := s.db.Select(&rows, `
		SELECT id, name, description, slug, message_template, send_start_hour, send_end_hour,
			digest_mode, digest_max_items, active, created_at,
			audience, member_count, ctr_30d, cvr_30d, revenue_30d
		FROM channel
		WHERE active = true
		  AND ($1 = '' OR audience->'categories' ? $1)
		ORDER BY id
	`, category)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		_ = rows[i].UnmarshalAudience()
	}
	return rows, nil
}

// ListChannelsForProduct retorna canais compatíveis com o produto via filtros de audience.
// Filtra channels cujo audience.categories contém category, price está no range e drop >= min_drop.
func (s *SQLStore) ListChannelsForProduct(category, brand string, price, drop float64) ([]models.Channel, error) {
	rows := []models.Channel{}
	err := s.db.Select(&rows, `
		SELECT id, name, description, slug, message_template, send_start_hour, send_end_hour,
			digest_mode, digest_max_items, active, created_at,
			audience, member_count, ctr_30d, cvr_30d, revenue_30d
		FROM channel
		WHERE active = true
		  AND ($1 = '' OR audience->'categories' ? $1)
		  AND ($3 = 0 OR (audience->>'min_price')::numeric <= $3)
		  AND ($3 = 0 OR (audience->>'max_price')::numeric = 0 OR (audience->>'max_price')::numeric >= $3)
		  AND ($4 = 0 OR (audience->>'min_drop')::numeric <= $4)
		ORDER BY id
	`, category, brand, price, drop)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		_ = rows[i].UnmarshalAudience()
	}
	return rows, nil
}

func (s *SQLStore) ListChannelTargets(channelID int64) ([]models.ChannelTarget, error) {
	var out []models.ChannelTarget
	err := s.db.Select(&out, `SELECT * FROM channeltarget WHERE channel_id = $1 ORDER BY id`, channelID)
	return out, err
}

func (s *SQLStore) CreateChannelTarget(t models.ChannelTarget) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO channeltarget (channel_id, provider, chat_id, name, invite_url, status)
		VALUES (:channel_id, :provider, :chat_id, :name, :invite_url, :status)`, t)
}

func (s *SQLStore) UpdateChannelTarget(t models.ChannelTarget) error {
	_, err := s.db.NamedExec(`
		UPDATE channeltarget SET provider=:provider, chat_id=:chat_id, name=:name,
			invite_url=:invite_url, status=:status
		WHERE id = :id`, t)
	return err
}

func (s *SQLStore) DeleteChannelTarget(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channeltarget WHERE id = $1`, id)
	return err
}

// GetChannelTarget retorna um target específico pelo ID.
func (s *SQLStore) GetChannelTarget(id int64) (models.ChannelTarget, error) {
	var t models.ChannelTarget
	err := s.db.Get(&t, `SELECT * FROM channeltarget WHERE id = $1`, id)
	return t, err
}

// ListAllChannelTargets retorna TODOS os channel targets (sem filtro de channel_id).
func (s *SQLStore) ListAllChannelTargets() ([]models.ChannelTarget, error) {
	var out []models.ChannelTarget
	err := s.db.Select(&out, `SELECT * FROM channeltarget ORDER BY id`)
	return out, err
}

func (s *SQLStore) ListChannelRules(channelID int64) ([]models.ChannelRule, error) {
	var out []models.ChannelRule
	err := s.db.Select(&out, `SELECT * FROM channelrule WHERE channel_id = $1 ORDER BY id`, channelID)
	return out, err
}

func (s *SQLStore) CreateChannelRule(r models.ChannelRule) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO channelrule (channel_id, match_type, match_value, max_price,
			notify_new, notify_drop, notify_lowest, drop_threshold, active)
		VALUES (:channel_id, :match_type, :match_value, :max_price,
			:notify_new, :notify_drop, :notify_lowest, :drop_threshold, :active)`, r)
}

func (s *SQLStore) UpdateChannelRule(r models.ChannelRule) error {
	_, err := s.db.NamedExec(`
		UPDATE channelrule SET match_type=:match_type, match_value=:match_value,
			max_price=:max_price, notify_new=:notify_new, notify_drop=:notify_drop,
			notify_lowest=:notify_lowest, drop_threshold=:drop_threshold, active=:active
		WHERE id = :id`, r)
	return err
}

func (s *SQLStore) DeleteChannelRule(id int64) error {
	_, err := s.db.Exec(`DELETE FROM channelrule WHERE id = $1`, id)
	return err
}

func (s *SQLStore) WasSentRecently(productID, targetID int64, since time.Time) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM sentmessagev2 WHERE catalog_product_id = $1 AND channel_target_id = $2 AND sent_at >= $3`,
		productID, targetID, since)
	return count > 0, err
}

func (s *SQLStore) RecordSent(sv models.SentMessageV2) error {
	_, err := s.db.NamedExec(`
		INSERT INTO sentmessagev2 (catalog_product_id, channel_target_id, is_drop)
		VALUES (:catalog_product_id, :channel_target_id, :is_drop)`, sv)
	return err
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

func (s *SQLStore) CreateBroadcast(b models.BroadcastMessage) (int64, error) {
	return insertReturningID(s.db, `
		INSERT INTO broadcastmessage (text, image_url, channel_ids, status)
		VALUES (:text, :image_url, :channel_ids, :status)`, b)
}

func (s *SQLStore) UpdateBroadcast(b models.BroadcastMessage) error {
	_, err := s.db.NamedExec(`
		UPDATE broadcastmessage SET status=:status, sent_count=:sent_count,
			sent_at=:sent_at, error_msg=:error_msg
		WHERE id = :id`, b)
	return err
}

func (s *SQLStore) ListBroadcasts(limit int) ([]models.BroadcastMessage, error) {
	var out []models.BroadcastMessage
	err := s.db.Select(&out,
		`SELECT * FROM broadcastmessage ORDER BY created_at DESC LIMIT $1`, limit)
	return out, err
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

func (s *SQLStore) CountClicksByProduct(productID int64) (int64, error) {
	var count int64
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM clicklog WHERE product_id = $1`, productID)
	return count, err
}

func (s *SQLStore) InsertClickLog(l models.ClickLog) error {
	_, err := s.db.NamedExec(`
		INSERT INTO clicklog (product_id, ip_hash, user_agent, referrer)
		VALUES (:product_id, :ip_hash, :user_agent, :referrer)`, l)
	return err
}

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

func (s *SQLStore) ListGroups() ([]models.Group, error) {
	var out []models.Group
	err := s.db.Select(&out, `SELECT * FROM "group" ORDER BY id`)
	return out, err
}

func (s *SQLStore) GetGroup(id int64) (models.Group, error) {
	var g models.Group
	err := s.db.Get(&g, `SELECT * FROM "group" WHERE id = $1`, id)
	return g, err
}

func (s *SQLStore) ListProductsByGroup(groupID int64, limit int) ([]models.Product, error) {
	var out []models.Product
	err := s.db.Select(&out,
		`SELECT * FROM product WHERE group_id = $1 ORDER BY found_at DESC LIMIT $2`, groupID, limit)
	return out, err
}

func (s *SQLStore) GetProductByShortID(shortID string) (models.Product, bool, error) {
	var p models.Product
	err := s.db.Get(&p, `SELECT * FROM product WHERE short_id = $1 LIMIT 1`, shortID)
	if err == sql.ErrNoRows {
		return p, false, nil
	}
	return p, err == nil, err
}

// ---------------------------------------------------------------------------
// TelegramChat
// ---------------------------------------------------------------------------

func (s *SQLStore) UpsertTelegramChat(c models.TelegramChat) error {
	_, err := s.db.NamedExec(`
		INSERT INTO telegramchat (chat_id, type, title, username, member_count, is_admin)
		VALUES (:chat_id, :type, :title, :username, :member_count, :is_admin)
		ON CONFLICT(chat_id) DO UPDATE SET
			title=excluded.title, username=excluded.username,
			member_count=excluded.member_count, is_admin=excluded.is_admin,
			last_seen_at=CURRENT_TIMESTAMP`, c)
	return err
}

func (s *SQLStore) ListTelegramChats() ([]models.TelegramChat, error) {
	var out []models.TelegramChat
	err := s.db.Select(&out, `SELECT * FROM telegramchat ORDER BY last_seen_at DESC`)
	return out, err
}

func (s *SQLStore) GetAnalyticsSummary(since time.Time, days int) (map[string]any, error) {
	var total, unique int64
	_ = s.db.Get(&total, `SELECT COUNT(*) FROM clicklog WHERE clicked_at >= $1`, since)
	_ = s.db.Get(&unique, `SELECT COUNT(DISTINCT ip_hash) FROM clicklog WHERE clicked_at >= $1`, since)

	type dailyRow struct {
		Day    string `db:"day"`
		Clicks int    `db:"clicks"`
	}
	var daily []dailyRow
	_ = s.db.Select(&daily, `
		SELECT TO_CHAR(clicked_at, 'YYYY-MM-DD') AS day, COUNT(*) AS clicks
		FROM clicklog WHERE clicked_at >= $1 GROUP BY day ORDER BY day`, since)

	type sourceRow struct {
		Source string `db:"source"`
		Clicks int    `db:"clicks"`
	}
	var bySource []sourceRow
	_ = s.db.Select(&bySource, `
		SELECT p.source, COUNT(*) AS clicks FROM clicklog c
		JOIN product p ON c.product_id = p.id
		WHERE c.clicked_at >= $1 GROUP BY p.source`, since)

	type topRow struct {
		ID     int64   `db:"id" json:"id"`
		Title  string  `db:"title" json:"title"`
		Source string  `db:"source" json:"source"`
		Price  float64 `db:"price" json:"price"`
		Clicks int     `db:"clicks" json:"clicks"`
	}
	var topProducts []topRow
	_ = s.db.Select(&topProducts, `
		SELECT p.id, p.title, p.source, p.price, COUNT(*) AS clicks
		FROM clicklog c JOIN product p ON c.product_id = p.id
		WHERE c.clicked_at >= $1 GROUP BY p.id ORDER BY clicks DESC LIMIT 10`, since)

	var catalogTotal, catalogNew, variantsTotal, messagesSent int64
	_ = s.db.Get(&catalogTotal, `SELECT COUNT(*) FROM catalogproduct`)
	_ = s.db.Get(&catalogNew, `SELECT COUNT(*) FROM catalogproduct WHERE created_at >= $1`, since)
	_ = s.db.Get(&variantsTotal, `SELECT COUNT(*) FROM catalogvariant`)
	_ = s.db.Get(&messagesSent, `SELECT COUNT(*) FROM sentmessagev2 WHERE sent_at >= $1`, since)

	dailyOut := make([]map[string]any, 0, len(daily))
	for _, d := range daily {
		dailyOut = append(dailyOut, map[string]any{"date": d.Day, "clicks": d.Clicks})
	}
	sourceOut := make([]map[string]any, 0, len(bySource))
	for _, s := range bySource {
		sourceOut = append(sourceOut, map[string]any{"source": s.Source, "clicks": s.Clicks})
	}
	if topProducts == nil {
		topProducts = []topRow{}
	}

	return map[string]any{
		"total": total, "unique": unique, "days": days,
		"daily": dailyOut, "by_source": sourceOut, "top_products": topProducts,
		"catalog_total": catalogTotal, "catalog_new": catalogNew,
		"variants_total": variantsTotal, "messages_sent": messagesSent,
	}, nil
}

// Garante que AppConfig existe com id=1
func (s *SQLStore) ensureConfig() error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO appconfig (id) VALUES (1)`)
	return err
}

// Valida slug (só alfanumérico + hífen)
func ValidSlug(slug string) error {
	for _, c := range slug {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
			return fmt.Errorf("slug inválido: só letras minúsculas, dígitos e hífen")
		}
	}
	return nil
}

// ─────────────────── Affiliates ──────────────────────

// ListAffiliates retorna todos os afiliados, opcionalmente filtrados por source_id.
func (s *SQLStore) ListAffiliates(sourceID *string) ([]models.Affiliate, error) {
	var query string
	var args []interface{}

	if sourceID != nil && *sourceID != "" {
		query = `SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates WHERE source_id = $1 ORDER BY created_at DESC`
		args = []interface{}{*sourceID}
	} else {
		query = `SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates ORDER BY created_at DESC`
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var affiliates []models.Affiliate
	for rows.Next() {
		var a models.Affiliate
		if err := rows.Scan(&a.ID, &a.SourceID, &a.Name, &a.TrackingID, &a.Active, &a.CreatedAt); err != nil {
			return nil, err
		}
		affiliates = append(affiliates, a)
	}
	return affiliates, nil
}

// GetAffiliate retorna um afiliado por ID.
func (s *SQLStore) GetAffiliate(id int64) (models.Affiliate, error) {
	var a models.Affiliate
	err := s.db.QueryRow(
		`SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates WHERE id = $1`,
		id,
	).Scan(&a.ID, &a.SourceID, &a.Name, &a.TrackingID, &a.Active, &a.CreatedAt)
	return a, err
}

// CreateAffiliate cria um novo afiliado.
func (s *SQLStore) CreateAffiliate(a models.Affiliate) (int64, error) {
	active := 0
	if a.Active {
		active = 1
	}
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO affiliates (source_id, name, tracking_id, active) VALUES ($1, $2, $3, $4) RETURNING id`,
		a.SourceID, a.Name, a.TrackingID, active,
	).Scan(&id)
	return id, err
}

// UpdateAffiliate atualiza um afiliado existente.
func (s *SQLStore) UpdateAffiliate(a models.Affiliate) error {
	active := 0
	if a.Active {
		active = 1
	}
	_, err := s.db.Exec(
		`UPDATE affiliates SET source_id = $1, name = $2, tracking_id = $3, active = $4 WHERE id = $5`,
		a.SourceID, a.Name, a.TrackingID, active, a.ID,
	)
	return err
}

// DeleteAffiliate deleta um afiliado.
func (s *SQLStore) DeleteAffiliate(id int64) error {
	_, err := s.db.Exec(`DELETE FROM affiliates WHERE id = $1`, id)
	return err
}

// GetAffiliateBySource retorna o afiliado ativo para um source_id específico.
func (s *SQLStore) GetAffiliateBySource(sourceID string) (models.Affiliate, bool, error) {
	var a models.Affiliate
	err := s.db.QueryRow(
		`SELECT id, source_id, name, tracking_id, active, created_at FROM affiliates WHERE source_id = $1 AND active = true LIMIT 1`,
		sourceID,
	).Scan(&a.ID, &a.SourceID, &a.Name, &a.TrackingID, &a.Active, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return a, false, nil
	}
	return a, err == nil, err
}

// ListAccountsForTarget retorna todas as contas associadas a um target, ordenadas por priority.
func (s *SQLStore) ListAccountsForTarget(targetID int64) ([]models.ChannelTargetAccount, error) {
	rows, err := s.db.Query(
		`SELECT id, target_id, account_id, role, priority, created_at FROM channel_target_accounts WHERE target_id = $1 ORDER BY priority ASC`,
		targetID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []models.ChannelTargetAccount
	for rows.Next() {
		var cta models.ChannelTargetAccount
		if err := rows.Scan(&cta.ID, &cta.TargetID, &cta.AccountID, &cta.Role, &cta.Priority, &cta.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, cta)
	}
	return accounts, rows.Err()
}

// GetAccountsByTargetWithRole retorna contas com um role específico para um target.
func (s *SQLStore) GetAccountsByTargetWithRole(targetID int64, role string) ([]models.ChannelTargetAccount, error) {
	rows, err := s.db.Query(
		`SELECT id, target_id, account_id, role, priority, created_at FROM channel_target_accounts WHERE target_id = $1 AND role = $2 ORDER BY priority ASC`,
		targetID, role,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []models.ChannelTargetAccount
	for rows.Next() {
		var cta models.ChannelTargetAccount
		if err := rows.Scan(&cta.ID, &cta.TargetID, &cta.AccountID, &cta.Role, &cta.Priority, &cta.CreatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, cta)
	}
	return accounts, rows.Err()
}

// ---------------------------------------------------------------------------
// RedesignGroups
// ---------------------------------------------------------------------------

func (s *SQLStore) ListRedesignGroups(channelID int64, platform, status string) ([]models.RedesignGroup, error) {
	q := `SELECT id, short_id, channel_id, wa_account_id, tg_account_id, name, platform,
	             jid, invite_link, status, member_count, overrides, created_at, last_message_at
	      FROM groups WHERE ($1 = 0 OR channel_id = $1)
	        AND ($2 = '' OR platform = $2)
	        AND ($3 = '' OR status = $3)
	      ORDER BY created_at DESC`
	var out []models.RedesignGroup
	return out, s.db.Select(&out, q, channelID, platform, status)
}

func (s *SQLStore) GetRedesignGroup(id int64) (models.RedesignGroup, error) {
	var g models.RedesignGroup
	return g, s.db.Get(&g,
		`SELECT id, short_id, channel_id, wa_account_id, tg_account_id, name, platform,
		        jid, invite_link, status, member_count, overrides, created_at, last_message_at
		 FROM groups WHERE id = $1`, id)
}

func (s *SQLStore) CreateRedesignGroup(g models.RedesignGroup) (int64, error) {
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO groups (channel_id, wa_account_id, tg_account_id, name, platform, jid, invite_link, status, overrides)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		g.ChannelID, g.WAAccountID, g.TGAccountID, g.Name, g.Platform,
		g.JID, g.InviteLink, g.Status, g.Overrides,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateRedesignGroup(g models.RedesignGroup) error {
	_, err := s.db.NamedExec(`
		UPDATE groups SET name=:name, platform=:platform, jid=:jid,
			invite_link=:invite_link, status=:status, member_count=:member_count,
			overrides=:overrides, wa_account_id=:wa_account_id, tg_account_id=:tg_account_id
		WHERE id=:id`, g)
	return err
}

func (s *SQLStore) DeleteRedesignGroup(id int64) error {
	_, err := s.db.Exec(`DELETE FROM groups WHERE id = $1`, id)
	return err
}

// ---------------------------------------------------------------------------
// AffiliatePrograms (ReDesign)
// ---------------------------------------------------------------------------

func (s *SQLStore) ListAffiliatePrograms(active *bool) ([]models.AffiliateProgram, error) {
	var out []models.AffiliateProgram
	if active == nil {
		return out, s.db.Select(&out,
			`SELECT id, short_id, name, marketplace, active, rules, postback, created_at
			 FROM affiliate_programs ORDER BY name`)
	}
	return out, s.db.Select(&out,
		`SELECT id, short_id, name, marketplace, active, rules, postback, created_at
		 FROM affiliate_programs WHERE active = $1 ORDER BY name`, *active)
}

func (s *SQLStore) GetAffiliateProgram(id int64) (models.AffiliateProgram, error) {
	var p models.AffiliateProgram
	return p, s.db.Get(&p,
		`SELECT id, short_id, name, marketplace, active, rules, postback, created_at
		 FROM affiliate_programs WHERE id = $1`, id)
}

func (s *SQLStore) CreateAffiliateProgram(p models.AffiliateProgram) (int64, error) {
	if p.Credentials == nil {
		p.Credentials = []byte("{}")
	}
	if p.Rules == nil {
		p.Rules = []byte("{}")
	}
	if p.Postback == nil {
		p.Postback = []byte("{}")
	}
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO affiliate_programs (name, marketplace, credentials, active, rules, postback)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		p.Name, p.Marketplace, p.Credentials, p.Active, p.Rules, p.Postback,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateAffiliateProgram(p models.AffiliateProgram) error {
	_, err := s.db.Exec(
		`UPDATE affiliate_programs SET name=$1, active=$2, rules=$3, postback=$4 WHERE id=$5`,
		p.Name, p.Active, p.Rules, p.Postback, p.ID)
	return err
}

func (s *SQLStore) DeleteAffiliateProgram(id int64) error {
	_, err := s.db.Exec(`DELETE FROM affiliate_programs WHERE id = $1`, id)
	return err
}

func (s *SQLStore) ListAffiliateProgramsByMarketplace(marketplace string) ([]models.AffiliateProgram, error) {
	var out []models.AffiliateProgram
	return out, s.db.Select(&out,
		`SELECT id, short_id, name, marketplace, credentials, active, rules, postback, created_at
		 FROM affiliate_programs WHERE marketplace = $1 AND active = true ORDER BY id`, marketplace)
}

// ---------------------------------------------------------------------------
// PublicLinks
// ---------------------------------------------------------------------------

func (s *SQLStore) CreatePublicLink(l models.PublicLink) (int64, error) {
	if l.FallbackChain == nil {
		l.FallbackChain = []byte("[]")
	}
	if l.RedirectStrategy == "" {
		l.RedirectStrategy = "first_active"
	}
	var id int64
	return id, s.db.QueryRow(`
		INSERT INTO public_links (slug, channel_id, fallback_chain, redirect_strategy)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		l.Slug, l.ChannelID, l.FallbackChain, l.RedirectStrategy,
	).Scan(&id)
}

func (s *SQLStore) GetPublicLink(id int64) (models.PublicLink, error) {
	var l models.PublicLink
	return l, s.db.Get(&l,
		`SELECT id, slug, channel_id, fallback_chain, redirect_strategy, round_robin_idx, active, clicks_30d, created_at
		 FROM public_links WHERE id = $1`, id)
}

func (s *SQLStore) GetPublicLinkBySlug(slug string) (models.PublicLink, error) {
	var l models.PublicLink
	return l, s.db.Get(&l,
		`SELECT id, slug, channel_id, fallback_chain, redirect_strategy, round_robin_idx, active, clicks_30d, created_at
		 FROM public_links WHERE slug = $1 AND active = true`, slug)
}

func (s *SQLStore) ListPublicLinks() ([]models.PublicLink, error) {
	var out []models.PublicLink
	return out, s.db.Select(&out,
		`SELECT id, slug, channel_id, fallback_chain, redirect_strategy, round_robin_idx, active, clicks_30d, created_at
		 FROM public_links ORDER BY created_at DESC`)
}

func (s *SQLStore) UpdatePublicLink(l models.PublicLink) error {
	_, err := s.db.Exec(`
		UPDATE public_links SET slug=$1, fallback_chain=$2, redirect_strategy=$3, active=$4 WHERE id=$5`,
		l.Slug, l.FallbackChain, l.RedirectStrategy, l.Active, l.ID)
	return err
}

func (s *SQLStore) DeletePublicLink(id int64) error {
	_, err := s.db.Exec(`DELETE FROM public_links WHERE id = $1`, id)
	return err
}

func (s *SQLStore) IncrementRoundRobinIdx(id int64, newIdx int) error {
	_, err := s.db.Exec(`UPDATE public_links SET round_robin_idx = $1 WHERE id = $2`, newIdx, id)
	return err
}

// ---------------------------------------------------------------------------
// Dispatches
// ---------------------------------------------------------------------------

func (s *SQLStore) CreateDispatch(d models.Dispatch, targets []models.DispatchTarget) (int64, error) {
	tx, err := s.db.Beginx()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck

	if d.Message == nil {
		d.Message = []byte("{}")
	}

	var id int64
	err = tx.QueryRow(`
		INSERT INTO dispatches (product_id, composed_by, message, affiliate_link, status)
		VALUES ($1, $2, $3, $4, 'queued') RETURNING id`,
		d.ProductID, d.ComposedBy, d.Message, d.AffiliateLink,
	).Scan(&id)
	if err != nil {
		return 0, err
	}

	for _, t := range targets {
		_, err = tx.Exec(`
			INSERT INTO dispatch_targets (dispatch_id, group_id, wa_account_id, tg_account_id, status)
			VALUES ($1, $2, $3, $4, 'pending')`,
			id, t.GroupID, t.WAAccountID, t.TGAccountID)
		if err != nil {
			return 0, err
		}
	}
	return id, tx.Commit()
}

func (s *SQLStore) GetDispatch(id int64) (models.Dispatch, error) {
	var d models.Dispatch
	return d, s.db.Get(&d,
		`SELECT id, short_id, product_id, composed_by, message, affiliate_link,
		        scheduled_for, created_by, status, created_at
		 FROM dispatches WHERE id = $1`, id)
}

func (s *SQLStore) ListDispatches(status string, limit, offset int) ([]models.Dispatch, error) {
	if limit == 0 {
		limit = 50
	}
	var out []models.Dispatch
	return out, s.db.Select(&out,
		`SELECT id, short_id, product_id, composed_by, message, affiliate_link,
		        scheduled_for, created_by, status, created_at
		 FROM dispatches WHERE ($1 = '' OR status = $1)
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, status, limit, offset)
}

func (s *SQLStore) ListDispatchTargets(dispatchID int64) ([]models.DispatchTarget, error) {
	var out []models.DispatchTarget
	return out, s.db.Select(&out,
		`SELECT id, dispatch_id, group_id, wa_account_id, tg_account_id, status,
		        attempted_at, delivered_at, error_reason, click_count, conversions, revenue
		 FROM dispatch_targets WHERE dispatch_id = $1`, dispatchID)
}

func (s *SQLStore) UpdateDispatchTargetStatus(id int64, status, errorReason string) error {
	_, err := s.db.Exec(`
		UPDATE dispatch_targets
		SET status = $1,
		    error_reason = NULLIF($2, ''),
		    attempted_at = CASE WHEN $1 = 'sending' THEN now() ELSE attempted_at END,
		    delivered_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivered_at END
		WHERE id = $3`, status, errorReason, id)
	return err
}

func (s *SQLStore) UpdateDispatchStatus(id int64, status string) error {
	_, err := s.db.Exec(`UPDATE dispatches SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (s *SQLStore) CancelDispatch(id int64) error {
	_, err := s.db.Exec(`
		UPDATE dispatches SET status = 'failed'
		WHERE id = $1 AND status IN ('draft', 'queued')`, id)
	return err
}

func (s *SQLStore) ListPendingDispatchTargets(limit int) ([]models.DispatchTarget, error) {
	if limit <= 0 { limit = 20 }
	var out []models.DispatchTarget
	err := s.db.Select(&out, `
		SELECT dt.* FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		WHERE dt.status = 'pending' AND d.status IN ('queued', 'sending')
		  AND (d.scheduled_for IS NULL OR d.scheduled_for <= now())
		ORDER BY dt.id ASC
		LIMIT $1`, limit)
	return out, err
}

func (s *SQLStore) AllDispatchTargetsFinished(dispatchID int64) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM dispatch_targets WHERE dispatch_id = $1 AND status IN ('pending','sending')`, dispatchID)
	return count == 0, err
}

// ---------------------------------------------------------------------------
// Clusters
// ---------------------------------------------------------------------------

func (s *SQLStore) ListClusters() ([]models.Cluster, error) {
	var out []models.Cluster
	return out, s.db.Select(&out,
		`SELECT id, label, COALESCE(description,'') as description,
		        member_channels, metrics, top_categories, top_brands, computed_at
		 FROM clusters ORDER BY computed_at DESC`)
}

func (s *SQLStore) GetCluster(id int64) (models.Cluster, error) {
	var c models.Cluster
	return c, s.db.Get(&c,
		`SELECT id, label, COALESCE(description,'') as description,
		        member_channels, metrics, top_categories, top_brands, computed_at
		 FROM clusters WHERE id = $1`, id)
}

func (s *SQLStore) UpsertClusters(clusters []models.Cluster) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.Exec(`DELETE FROM clusters`); err != nil {
		return err
	}
	for _, c := range clusters {
		if _, err := tx.Exec(`
			INSERT INTO clusters (label, description, member_channels, metrics, top_categories, top_brands)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			c.Label, c.Description, c.MemberChannels, c.Metrics, c.TopCategories, c.TopBrands); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------------------------------------------------------------------------
// GroupSpies
// ---------------------------------------------------------------------------

func (s *SQLStore) ListGroupSpies(platform string, activeOnly bool) ([]models.GroupSpy, error) {
	q := `SELECT id, short_id, group_name, platform, invite_link, reader_wa_id, reader_tg_id,
	             remote_group_id, active, joined_at, stats
	      FROM group_spies
	      WHERE deleted_at IS NULL
	        AND ($1 = '' OR platform = $1)
	        AND ($2 = false OR active = true)
	      ORDER BY joined_at DESC`
	var out []models.GroupSpy
	return out, s.db.Select(&out, q, platform, activeOnly)
}

func (s *SQLStore) GetGroupSpy(id int64) (models.GroupSpy, error) {
	var g models.GroupSpy
	return g, s.db.Get(&g,
		`SELECT id, short_id, group_name, platform, invite_link, reader_wa_id, reader_tg_id,
		        remote_group_id, active, joined_at, stats
		 FROM group_spies WHERE id = $1 AND deleted_at IS NULL`, id)
}

func (s *SQLStore) CreateGroupSpy(g models.GroupSpy) (int64, error) {
	if g.Stats == nil {
		g.Stats = []byte("{}")
	}
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO group_spies (group_name, platform, invite_link, reader_wa_id, reader_tg_id, active, stats)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		g.GroupName, g.Platform, g.InviteLink, g.ReaderWAID, g.ReaderTGID, true, g.Stats,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) SoftDeleteGroupSpy(id int64) error {
	_, err := s.db.Exec(`UPDATE group_spies SET active = false, deleted_at = now() WHERE id = $1`, id)
	return err
}
