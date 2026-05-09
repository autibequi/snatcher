package store

import (
	crand "crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"snatcher/backendv2/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
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

func (s *SQLStore) TouchAutoMatchWorkerRun(at time.Time) error {
	_, err := s.db.Exec(`UPDATE appconfig SET auto_match_last_worker_run_at = $1 WHERE id = 1`, at)
	return err
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
			tg_group_prefix=:tg_group_prefix, tg_last_update_id=:tg_last_update_id,
			llm_provider=:llm_provider, llm_api_key=:llm_api_key,
			llm_base_url=:llm_base_url, llm_model=:llm_model,
			llm_ollama_base_url=:llm_ollama_base_url, llm_ollama_model=:llm_ollama_model,
			llm_vllm_base_url=:llm_vllm_base_url, llm_vllm_model=:llm_vllm_model,
			llm_vllm_api_key=:llm_vllm_api_key,
			llm_openrouter_fallback_model=:llm_openrouter_fallback_model,
			llm_reasoning_ollama=:llm_reasoning_ollama,
			llm_reasoning_vllm=:llm_reasoning_vllm,
			llm_reasoning_openrouter=:llm_reasoning_openrouter,
			llm_temperature=:llm_temperature,
			app_name=:app_name, app_domain=:app_domain,
			auto_match_enabled=:auto_match_enabled,
			auto_match_threshold=:auto_match_threshold,
			auto_match_max_per_run=:auto_match_max_per_run,
			full_auto_mode=:full_auto_mode,
			notify_approval_webhook=:notify_approval_webhook,
			auto_match_only_curated=:auto_match_only_curated
		WHERE id = 1`, cfg)
	return err
}

func (s *SQLStore) CreateAutoMatchLog(log models.AutoMatchLog) (int64, error) {
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO auto_match_logs (product_id, channel_id, dispatch_id, score)
		VALUES ($1, $2, $3, $4)
		RETURNING id`,
		log.ProductID, log.ChannelID, log.DispatchID, log.Score).Scan(&id)
	return id, err
}

func (s *SQLStore) GetChannelStats(channelID int64) (ChannelStats, error) {
	var stats ChannelStats

	// Grupos do canal
	var groupIDs []int64
	if err := s.db.Select(&groupIDs, `SELECT id FROM groups WHERE channel_id = $1 AND status <> 'deleted'`, channelID); err != nil || len(groupIDs) == 0 {
		return stats, nil
	}

	arr := pq.Array(groupIDs)

	// Cliques totais
	_ = s.db.Get(&stats.TotalClicks, `
		SELECT COALESCE(SUM(dt.click_count), 0)
		FROM dispatch_targets dt
		WHERE dt.group_id = ANY($1)`, arr)

	// Disparos últimos 7 dias
	_ = s.db.Get(&stats.Dispatches7d, `
		SELECT COUNT(DISTINCT d.id)
		FROM dispatches d
		JOIN dispatch_targets dt ON dt.dispatch_id = d.id
		WHERE dt.group_id = ANY($1)
		  AND d.created_at >= now() - interval '7 days'`, arr)

	// Produtos únicos disparados
	_ = s.db.Get(&stats.ProductCount, `
		SELECT COUNT(DISTINCT d.product_id)
		FROM dispatches d
		JOIN dispatch_targets dt ON dt.dispatch_id = d.id
		WHERE dt.group_id = ANY($1)
		  AND d.product_id IS NOT NULL`, arr)

	// Cliques últimas 24h
	_ = s.db.Get(&stats.Clicks24h, `
		SELECT COALESCE(SUM(dt.click_count), 0)
		FROM dispatch_targets dt
		WHERE dt.group_id = ANY($1)
		  AND dt.delivered_at >= now() - interval '24 hours'`, arr)

	// Taxa de entrega (% targets delivered)
	_ = s.db.Get(&stats.DeliveryRate, `
		SELECT COALESCE(
			COUNT(*) FILTER (WHERE dt.status = 'delivered') * 100.0 / NULLIF(COUNT(*), 0),
			0
		)
		FROM dispatch_targets dt
		WHERE dt.group_id = ANY($1)`, arr)

	// Série diária
	_ = s.db.Select(&stats.Series, `
		SELECT to_char(d.created_at::date, 'Dy') AS day,
		       COUNT(DISTINCT d.id)::int AS value
		FROM dispatches d
		JOIN dispatch_targets dt ON dt.dispatch_id = d.id
		WHERE dt.group_id = ANY($1)
		  AND d.created_at >= now() - interval '7 days'
		GROUP BY d.created_at::date
		ORDER BY d.created_at::date`, arr)

	return stats, nil
}

func (s *SQLStore) ListAutoMatchLogs(limit int) ([]models.AutoMatchLog, error) {
	if limit <= 0 { limit = 50 }
	var out []models.AutoMatchLog
	// Mantém TODOS os logs no cooldown — evita duplicatas em cada ciclo. Para desbloquear
	// cooldown stale (ex: dispatches abandonados), use Jonfrey → reset_stale_cooldown.
	err := s.db.Select(&out, `
		SELECT l.id, l.product_id, l.channel_id, l.dispatch_id, l.score, l.created_at,
		       COALESCE(l.score_breakdown, '{}'::jsonb) AS score_breakdown,
		       COALESCE(l.match_reasons, '{}'::text[]) AS match_reasons,
		       l.false_positive, l.false_positive_reason, l.false_positive_marked_at,
		       COALESCE(p.canonical_name, '') as product_name,
		       COALESCE(c.name, '') as channel_name,
		       COALESCE(
		           (SELECT STRING_AGG(g.name, ', ' ORDER BY g.name)
		            FROM dispatch_targets dt
		            JOIN groups g ON g.id = dt.group_id
		            WHERE dt.dispatch_id = l.dispatch_id),
		           ''
		       ) AS group_names
		FROM auto_match_logs l
		LEFT JOIN catalogproduct p ON p.id = l.product_id
		LEFT JOIN channel c ON c.id = l.channel_id
		ORDER BY l.created_at DESC LIMIT $1`, limit)
	return out, err
}

// GetHistoricalCTRForGroup calcula CTR = SUM(click_count) / COUNT(dispatches) para o
// grupo no contexto da categoria do produto (match via tags JSONB do catalog product).
// Retorna nil se o número de dispatches qualificados for menor que minDispatches.
//
// Tabelas: dispatch_targets (group_id, click_count, dispatch_id),
//          dispatches (id, product_id), catalogproduct (id, tags).
// Nota: category é comparada contra tags JSONB de catalogproduct via operador @>.
func (s *SQLStore) GetHistoricalCTRForGroup(groupID int64, category string, minDispatches int) (*float64, error) {
	if minDispatches <= 0 {
		minDispatches = 5
	}
	var result struct {
		TotalDispatches int     `db:"total_dispatches"`
		TotalClicks     int64   `db:"total_clicks"`
	}
	err := s.db.Get(&result, `
		SELECT COUNT(dt.id)       AS total_dispatches,
		       COALESCE(SUM(dt.click_count), 0) AS total_clicks
		FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		JOIN catalogproduct cp ON cp.id = d.product_id
		WHERE dt.group_id = $1
		  AND ($2 = '' OR cp.tags::jsonb @> to_jsonb($2::text))
	`, groupID, category)
	if err != nil {
		return nil, err
	}
	if result.TotalDispatches < minDispatches {
		return nil, nil //nolint:nilnil
	}
	ctr := float64(result.TotalClicks) / float64(result.TotalDispatches)
	return &ctr, nil
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
// Throttle
// ---------------------------------------------------------------------------

// CheckAndIncrementWA verifies if the WA account has reached its daily limit before sending.
// Returns error if daily_limit exceeded; atomically increments sent_today if OK.
func (s *SQLStore) CheckAndIncrementWA(accountID int64) error {
	var row struct {
		SentToday  int `db:"sent_today"`
		DailyLimit int `db:"daily_limit"`
	}
	if err := s.db.Get(&row, `SELECT sent_today, daily_limit FROM waaccount WHERE id = $1`, accountID); err != nil {
		return fmt.Errorf("throttle: WA account %d not found: %w", accountID, err)
	}
	if row.DailyLimit > 0 && row.SentToday >= row.DailyLimit {
		return fmt.Errorf("throttle: WA account %d reached daily limit (%d/%d)", accountID, row.SentToday, row.DailyLimit)
	}
	_, err := s.db.Exec(`UPDATE waaccount SET sent_today = sent_today + 1 WHERE id = $1`, accountID)
	if err != nil {
		return fmt.Errorf("throttle: failed to increment sent_today: %w", err)
	}
	return nil
}

// CheckAndIncrementTG verifies if the TG account has reached its daily limit before sending.
// Returns error if daily_limit exceeded; atomically increments sent_today if OK.
func (s *SQLStore) CheckAndIncrementTG(accountID int64) error {
	var row struct {
		SentToday  int `db:"sent_today"`
		DailyLimit int `db:"daily_limit"`
	}
	if err := s.db.Get(&row, `SELECT sent_today, daily_limit FROM tgaccount WHERE id = $1`, accountID); err != nil {
		return fmt.Errorf("throttle: TG account %d not found: %w", accountID, err)
	}
	if row.DailyLimit > 0 && row.SentToday >= row.DailyLimit {
		return fmt.Errorf("throttle: TG account %d reached daily limit (%d/%d)", accountID, row.SentToday, row.DailyLimit)
	}
	_, err := s.db.Exec(`UPDATE tgaccount SET sent_today = sent_today + 1 WHERE id = $1`, accountID)
	if err != nil {
		return fmt.Errorf("throttle: failed to increment sent_today: %w", err)
	}
	return nil
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
	// Remove logs filhos antes — crawllog tem FK sem CASCADE
	if _, err := s.db.Exec(`DELETE FROM crawllog WHERE search_term_id = $1`, id); err != nil {
		return err
	}
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
	if len(r.Metadata) == 0 {
		r.Metadata = []byte("{}")
	}
	return insertReturningID(s.db, `
		INSERT INTO crawlresult (search_term_id, title, price, url, image_url, source, source_subid, metadata)
		VALUES (:search_term_id, :title, :price, :url, :image_url, :source, :source_subid, :metadata)`, r)
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

func (s *SQLStore) SearchCatalogProducts(q string, limit int) ([]models.CatalogProduct, error) {
	if limit <= 0 { limit = 10 }
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

func (s *SQLStore) GetShortLinkByID(shortID string) (destURL string, source string, found bool) {
	var row struct {
		DestURL string `db:"dest_url"`
		Source  string `db:"source"`
	}
	if err := s.db.Get(&row, `SELECT dest_url, source FROM short_links WHERE short_id = $1`, shortID); err != nil {
		return "", "", false
	}
	_, _ = s.db.Exec(`UPDATE short_links SET click_count = click_count + 1 WHERE short_id = $1`, shortID)
	return row.DestURL, row.Source, true
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

func (s *SQLStore) GetChannelAutomation(channelID int64) (*models.ChannelAutomation, error) {
	var a models.ChannelAutomation
	err := s.db.Get(&a, `
		SELECT ca.*, c.name AS channel_name
		FROM channel_automations ca
		JOIN channel c ON c.id = ca.channel_id
		WHERE ca.channel_id = $1`, channelID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &a, err
}

func (s *SQLStore) UpsertChannelAutomation(a models.ChannelAutomation) error {
	_, err := s.db.NamedExec(`
		INSERT INTO channel_automations
			(channel_id, enabled, auto_match_enabled, threshold, max_per_run, cooldown_hours,
			 events_enabled, notify_new, notify_drop, notify_lowest, drop_threshold,
			 match_type, match_value, max_price, paused_until)
		VALUES
			(:channel_id, :enabled, :auto_match_enabled, :threshold, :max_per_run, :cooldown_hours,
			 :events_enabled, :notify_new, :notify_drop, :notify_lowest, :drop_threshold,
			 :match_type, :match_value, :max_price, :paused_until)
		ON CONFLICT (channel_id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			auto_match_enabled = EXCLUDED.auto_match_enabled,
			threshold = EXCLUDED.threshold,
			max_per_run = EXCLUDED.max_per_run,
			cooldown_hours = EXCLUDED.cooldown_hours,
			events_enabled = EXCLUDED.events_enabled,
			notify_new = EXCLUDED.notify_new,
			notify_drop = EXCLUDED.notify_drop,
			notify_lowest = EXCLUDED.notify_lowest,
			drop_threshold = EXCLUDED.drop_threshold,
			match_type = EXCLUDED.match_type,
			match_value = EXCLUDED.match_value,
			max_price = EXCLUDED.max_price,
			paused_until = EXCLUDED.paused_until,
			updated_at = now()`, a)
	return err
}

func (s *SQLStore) ListChannelAutomations(enabledOnly bool) ([]models.ChannelAutomation, error) {
	var out []models.ChannelAutomation
	q := `SELECT ca.*, c.name AS channel_name
		  FROM channel_automations ca
		  JOIN channel c ON c.id = ca.channel_id`
	if enabledOnly {
		q += ` WHERE ca.enabled = TRUE`
	}
	q += ` ORDER BY c.name`
	err := s.db.Select(&out, q)
	return out, err
}

func (s *SQLStore) ListAutoMatchLogsByChannel(channelID int64, limit int) ([]models.AutoMatchLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []models.AutoMatchLog
	err := s.db.Select(&out, `
		SELECT l.id, l.product_id, l.channel_id, l.dispatch_id, l.score, l.created_at,
		       COALESCE(p.canonical_name, '') AS product_name,
		       COALESCE(ch.name, '') AS channel_name,
		       COALESCE(
		           (SELECT STRING_AGG(g.name, ', ' ORDER BY g.name)
		            FROM dispatch_targets dt
		            JOIN groups g ON g.id = dt.group_id
		            WHERE dt.dispatch_id = l.dispatch_id),
		           ''
		       ) AS group_names
		FROM auto_match_logs l
		LEFT JOIN catalogproduct p ON p.id = l.product_id
		LEFT JOIN channel ch ON ch.id = l.channel_id
		WHERE l.channel_id = $1
		ORDER BY l.created_at DESC
		LIMIT $2`, channelID, limit)
	return out, err
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
	// Soma clicks legados (clicklog) + novos (shortlink_clicks)
	_ = s.db.Get(&total, `
		SELECT COALESCE((SELECT COUNT(*) FROM clicklog WHERE clicked_at >= $1), 0)
		     + COALESCE((SELECT COUNT(*) FROM shortlink_clicks WHERE clicked_at >= $1), 0)`, since)
	_ = s.db.Get(&unique, `
		SELECT COUNT(DISTINCT ip_hash) FROM (
			SELECT ip_hash FROM clicklog WHERE clicked_at >= $1
			UNION ALL
			SELECT ip_hash FROM shortlink_clicks WHERE clicked_at >= $1
		) u`, since)

	type dailyRow struct {
		Day    string `db:"day"`
		Clicks int    `db:"clicks"`
	}
	var daily []dailyRow
	_ = s.db.Select(&daily, `
		SELECT day, SUM(clicks) AS clicks FROM (
			SELECT TO_CHAR(clicked_at, 'YYYY-MM-DD') AS day, COUNT(*) AS clicks
			FROM clicklog WHERE clicked_at >= $1 GROUP BY day
			UNION ALL
			SELECT TO_CHAR(clicked_at, 'YYYY-MM-DD') AS day, COUNT(*) AS clicks
			FROM shortlink_clicks WHERE clicked_at >= $1 GROUP BY day
		) u GROUP BY day ORDER BY day`, since)

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
	             jid, invite_link, status, member_count, overrides, created_at, last_message_at,
	             COALESCE(archived, false) AS archived, last_error, last_error_at
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
		        jid, invite_link, status, member_count, overrides, created_at, last_message_at,
		        COALESCE(archived, false) AS archived, last_error, last_error_at
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

func (s *SQLStore) CountGroupsWithSameJID(platform, jid string) (int, error) {
	var n int
	err := s.db.Get(&n, `
		SELECT COUNT(*) FROM groups
		WHERE platform = $1 AND jid = $2 AND COALESCE(archived, false) = false`,
		platform, jid)
	return n, err
}

func (s *SQLStore) FindConflictingRedesignGroup(candidate models.RedesignGroup, excludeID int64) (*models.RedesignGroup, error) {
	if !candidate.JID.Valid {
		return nil, nil
	}
	jid := strings.TrimSpace(candidate.JID.String)
	if jid == "" {
		return nil, nil
	}
	platform := strings.TrimSpace(candidate.Platform)
	if platform == "" {
		return nil, nil
	}

	const base = `SELECT id, short_id, channel_id, wa_account_id, tg_account_id, name, platform,
		jid, invite_link, status, member_count, overrides, created_at, last_message_at,
		COALESCE(archived, false) AS archived, last_error, last_error_at
		FROM groups
		WHERE id <> $1 AND COALESCE(archived, false) = false
		AND platform = $2
		AND trim(jid) <> ''
		AND lower(trim(jid)) = lower(trim($3))`

	var dup models.RedesignGroup
	var err error

	switch {
	case candidate.ChannelID.Valid:
		err = s.db.Get(&dup, base+` AND channel_id = $4 LIMIT 1`, excludeID, platform, jid, candidate.ChannelID.Int64)
	case candidate.WAAccountID.Valid:
		err = s.db.Get(&dup, base+` AND channel_id IS NULL AND wa_account_id = $4 LIMIT 1`, excludeID, platform, jid, candidate.WAAccountID.Int64)
	case candidate.TGAccountID.Valid:
		err = s.db.Get(&dup, base+` AND channel_id IS NULL AND tg_account_id = $4 LIMIT 1`, excludeID, platform, jid, candidate.TGAccountID.Int64)
	default:
		return nil, nil
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &dup, nil
}

func (s *SQLStore) SoftWipeOperationalData() error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmts := []string{
		`UPDATE groups SET archived = true WHERE COALESCE(archived, false) = false`,
		`UPDATE channel SET active = false WHERE active = true`,
		`UPDATE catalogproduct SET inactive = true WHERE COALESCE(inactive, false) = false`,
		`UPDATE group_spies SET active = false, deleted_at = NOW() WHERE deleted_at IS NULL`,
	}
	for _, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLStore) ReseedTaxonomySeedInserts() error {
	stmts := splitTaxonomySeedStatements(taxonomySeedDataSQL)
	if len(stmts) == 0 {
		return fmt.Errorf("seed embutido vazio ou sem INSERT")
	}
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return fmt.Errorf("stmt %d/%d: %w", i+1, len(stmts), err)
		}
	}
	return tx.Commit()
}

func (s *SQLStore) ReseedCrawlerChannelSeedInserts() error {
	stmts := splitTaxonomySeedStatements(crawlerChannelSeedSQL)
	if len(stmts) == 0 {
		return fmt.Errorf("crawler/channel seed embutido vazio ou sem INSERT")
	}
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return fmt.Errorf("crawler/channel stmt %d/%d: %w", i+1, len(stmts), err)
		}
	}
	return tx.Commit()
}

func (s *SQLStore) UpdateRedesignGroup(g models.RedesignGroup) error {
	_, err := s.db.NamedExec(`
		UPDATE groups SET name=:name, platform=:platform, jid=:jid,
			invite_link=:invite_link, status=:status, member_count=:member_count,
			overrides=:overrides, wa_account_id=:wa_account_id, tg_account_id=:tg_account_id,
			channel_id=:channel_id,
			archived=:archived, last_error=:last_error, last_error_at=:last_error_at
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
		`SELECT id, short_id, name, marketplace, active, credentials, rules, postback, created_at
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
	if p.Credentials == nil {
		p.Credentials = []byte("{}")
	}
	_, err := s.db.Exec(
		`UPDATE affiliate_programs SET name=$1, active=$2, credentials=$3, rules=$4, postback=$5 WHERE id=$6`,
		p.Name, p.Active, p.Credentials, p.Rules, p.Postback, p.ID)
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

// IncrementPublicLinkClicks aumenta clicks_30d em 1 para o link público dado.
// Usado pelo resolver /g/{slug} para fechar o loop de atribuição.
// Nota: clicks_30d hoje é cumulativo na coluna; o "30d" é semântico — o expurgo
// fica para um job de cleanup periódico, fora do hot path do resolver.
func (s *SQLStore) IncrementPublicLinkClicks(id int64) error {
	_, err := s.db.Exec(`UPDATE public_links SET clicks_30d = clicks_30d + 1 WHERE id = $1`, id)
	return err
}

// PurgeOldLLMMetrics apaga registros mais antigos que `days` dias da tabela
// llm_metrics. Retorna quantas linhas foram removidas. Idealmente chamado
// por um job diário; ver docs/llm-metrics-retention.md.
func (s *SQLStore) PurgeOldLLMMetrics(days int) (int64, error) {
	if days <= 0 {
		days = 90
	}
	res, err := s.db.Exec(
		`DELETE FROM llm_metrics WHERE created_at < now() - ($1 || ' days')::interval`,
		days,
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
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
	status := d.Status
	if status == "" {
		status = "queued"
	}
	var scheduledFor interface{}
	if d.ScheduledFor.Valid {
		scheduledFor = d.ScheduledFor.Time
	}
	err = tx.QueryRow(`
		INSERT INTO dispatches (product_id, composed_by, message, affiliate_link, status, scheduled_for)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		d.ProductID, d.ComposedBy, d.Message, d.AffiliateLink, status, scheduledFor,
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

// CountRecentDeliveriesByGroup retorna quantos dispatches foram entregues por grupo
// nos últimos `minutes`. Usado pelo dispatch worker para aplicar rate limit por grupo.
func (s *SQLStore) CountRecentDeliveriesByGroup(minutes int) ([]GroupDeliveryCount, error) {
	if minutes <= 0 { minutes = 60 }
	var out []GroupDeliveryCount
	err := s.db.Select(&out, `
		SELECT group_id, COUNT(*) AS count
		FROM dispatch_targets
		WHERE status IN ('delivered', 'sending')
		  AND COALESCE(delivered_at, updated_at, created_at) > now() - ($1 || ' minutes')::interval
		GROUP BY group_id`, minutes)
	return out, err
}

// CountPendingTargetsByGroup retorna quantos targets pending+queued+sending estão pendentes por grupo.
// Usado pelo auto-match para backpressure (não criar novos dispatches se grupo já tem fila grande).
func (s *SQLStore) CountPendingTargetsByGroup() ([]GroupDeliveryCount, error) {
	var out []GroupDeliveryCount
	err := s.db.Select(&out, `
		SELECT group_id, COUNT(*) AS count
		FROM dispatch_targets
		WHERE status IN ('pending', 'sending')
		GROUP BY group_id`)
	return out, err
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

func (s *SQLStore) HasDeliveredTarget(dispatchID int64) (bool, error) {
	var count int
	err := s.db.Get(&count,
		`SELECT COUNT(*) FROM dispatch_targets WHERE dispatch_id = $1 AND status = 'delivered'`, dispatchID)
	return count > 0, err
}

func (s *SQLStore) ListChannelDispatchHistory(channelID int64, limit int) ([]models.ChannelHistoryEntry, error) {
	if limit == 0 { limit = 50 }
	var out []models.ChannelHistoryEntry
	err := s.db.Select(&out, `
		SELECT dt.dispatch_id, g.id as group_id, g.name as group_name,
		       dt.status, dt.delivered_at,
		       COALESCE((d.message->>'text')::text, '') as message_text,
		       d.created_at,
		       aml.score
		FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		JOIN groups g ON g.id = dt.group_id
		LEFT JOIN auto_match_logs aml ON aml.dispatch_id = d.id
		WHERE g.channel_id = $1
		ORDER BY d.created_at DESC
		LIMIT $2`, channelID, limit)
	return out, err
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

func (s *SQLStore) UpdateGroupSpyReader(id int64, readerWAID, readerTGID models.NullInt64) error {
	_, err := s.db.Exec(
		`UPDATE group_spies SET reader_wa_id = $1, reader_tg_id = $2 WHERE id = $3 AND deleted_at IS NULL`,
		readerWAID, readerTGID, id,
	)
	return err
}

func (s *SQLStore) ListSpyMessages(spyID int64, limit int) ([]models.SpyMessage, error) {
	if limit <= 0 { limit = 50 }
	var out []models.SpyMessage
	err := s.db.Select(&out,
		`SELECT id, spy_id, sender, text, media_url, collected_at
		 FROM spy_messages WHERE spy_id = $1
		 ORDER BY collected_at DESC LIMIT $2`, spyID, limit)
	if out == nil { out = []models.SpyMessage{} }
	return out, err
}

func (s *SQLStore) CreateSpyMessage(m models.SpyMessage) error {
	_, err := s.db.Exec(
		`INSERT INTO spy_messages (spy_id, sender, text, media_url) VALUES ($1, $2, $3, $4)`,
		m.SpyID, m.Sender, m.Text, m.MediaURL)
	return err
}

// ---------------------------------------------------------------------------
// GroupAdmins (migration 0085)
// ---------------------------------------------------------------------------

func (s *SQLStore) ListGroupAdmins(groupID int64) ([]models.GroupAdmin, error) {
	var out []models.GroupAdmin
	err := s.db.Select(&out,
		`SELECT id, group_id, account_type, account_id, added_at
		 FROM group_admins WHERE group_id = $1 ORDER BY added_at ASC`, groupID)
	if out == nil {
		out = []models.GroupAdmin{}
	}
	return out, err
}

func (s *SQLStore) AddGroupAdmin(a models.GroupAdmin) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO group_admins (group_id, account_type, account_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (group_id, account_type, account_id) DO UPDATE SET added_at = now()
		 RETURNING id`,
		a.GroupID, a.AccountType, a.AccountID).Scan(&id)
	return id, err
}

func (s *SQLStore) DeleteGroupAdmin(id int64) error {
	_, err := s.db.Exec(`DELETE FROM group_admins WHERE id = $1`, id)
	return err
}

func (s *SQLStore) CountGroupAdmins(groupID int64) (int, error) {
	var count int
	err := s.db.Get(&count, `SELECT COUNT(*) FROM group_admins WHERE group_id = $1`, groupID)
	return count, err
}

// SetGroupArchived alterna archived e opcionalmente seta last_error.
func (s *SQLStore) SetGroupArchived(id int64, archived bool, lastError *string) error {
	if lastError != nil {
		_, err := s.db.Exec(
			`UPDATE groups SET archived = $1, last_error = $2, last_error_at = now() WHERE id = $3`,
			archived, *lastError, id)
		return err
	}
	_, err := s.db.Exec(`UPDATE groups SET archived = $1 WHERE id = $2`, archived, id)
	return err
}

// ---------------------------------------------------------------------------
// AffiliateConversions (migration 0086)
// ---------------------------------------------------------------------------

func (s *SQLStore) InsertAffiliateConversion(c models.AffiliateConversion) (int64, error) {
	var id int64
	err := s.db.QueryRow(
		`INSERT INTO affiliate_conversions (program_id, click_id, external_order_id, revenue, status)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		c.ProgramID, c.ClickID, c.ExternalOrderID, c.Revenue, c.Status).Scan(&id)
	return id, err
}

// ---------------------------------------------------------------------------
// Product failures (purge 404)
// ---------------------------------------------------------------------------

func (s *SQLStore) IncrementProductFailures(id int64) error {
	_, err := s.db.Exec(`
		UPDATE catalogproduct
		SET consecutive_failures = consecutive_failures + 1,
		    inactive = (consecutive_failures + 1 >= 10)
		WHERE id = $1`, id)
	return err
}

func (s *SQLStore) ResetProductFailures(id int64) error {
	_, err := s.db.Exec(`
		UPDATE catalogproduct
		SET consecutive_failures = 0,
		    inactive = FALSE
		WHERE id = $1 AND (consecutive_failures > 0 OR inactive = TRUE)`, id)
	return err
}

// ListTaxonomy retorna entradas da taxonomia (categorias ou marcas).
// Se type for vazio, retorna ambos.
func (s *SQLStore) ListTaxonomy(taxType string) ([]models.Taxonomy, error) {
	var out []models.Taxonomy
	if taxType == "" {
		err := s.db.Select(&out, `
			SELECT id, type, name, slug, keywords, parent_id, detect_count,
			       last_detected_at, active, status, source, sample_text, created_at
			FROM taxonomy WHERE status = 'approved' ORDER BY type, name`)
		return out, err
	}
	err := s.db.Select(&out, `
		SELECT id, type, name, slug, keywords, parent_id, detect_count,
		       last_detected_at, active, status, source, sample_text, created_at
		FROM taxonomy WHERE type = $1 AND status = 'approved' AND active = true ORDER BY name`, taxType)
	return out, err
}

// ListTaxonomyWithParent retorna entradas da taxonomia filtradas por type e/ou parent_id.
// parentID == nil → sem filtro por parent; parentID com valor específico (inclusive 0) → filtro aplicado.
func (s *SQLStore) ListTaxonomyWithParent(taxType string, parentID *int64) ([]models.Taxonomy, error) {
	var out []models.Taxonomy

	query := `
		SELECT id, type, name, slug, keywords, parent_id, detect_count,
		       last_detected_at, active, status, source, sample_text, created_at
		FROM taxonomy WHERE status = 'approved' AND active = true`

	var args []interface{}

	if taxType != "" {
		query += ` AND type = $1`
		args = append(args, taxType)
	}

	if parentID != nil {
		if len(args) == 0 {
			query += ` AND parent_id = $1`
		} else {
			query += ` AND parent_id = $2`
		}
		args = append(args, *parentID)
	}

	query += ` ORDER BY name`

	var err error
	if len(args) == 0 {
		err = s.db.Select(&out, query)
	} else if len(args) == 1 {
		err = s.db.Select(&out, query, args[0])
	} else {
		err = s.db.Select(&out, query, args[0], args[1])
	}

	return out, err
}

// IncrementTaxonomyDetect aumenta o contador de detecção e atualiza last_detected_at.
// Usado pelo crawler/categorizador para tunning das keywords.
func (s *SQLStore) IncrementTaxonomyDetect(id int64) error {
	_, err := s.db.Exec(`
		UPDATE taxonomy SET detect_count = detect_count + 1, last_detected_at = now()
		WHERE id = $1`, id)
	return err
}

// CreateTaxonomy insere nova entrada (categoria/marca).
func (s *SQLStore) CreateTaxonomy(t models.Taxonomy) (int64, error) {
	if t.Status == "" {
		t.Status = "approved"
	}
	if t.Source == "" {
		t.Source = "manual"
	}
	var id int64
	err := s.db.QueryRow(`
		INSERT INTO taxonomy (type, name, slug, keywords, parent_id, active, status, source, sample_text)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (type, slug) DO UPDATE SET
			name = EXCLUDED.name,
			keywords = EXCLUDED.keywords,
			active = EXCLUDED.active
		RETURNING id`,
		t.Type, t.Name, t.Slug, t.Keywords, t.ParentID, t.Active, t.Status, t.Source, t.SampleText,
	).Scan(&id)
	return id, err
}

// UpdateTaxonomy atualiza nome, keywords e active de uma entrada.
func (s *SQLStore) UpdateTaxonomy(t models.Taxonomy) error {
	_, err := s.db.Exec(`
		UPDATE taxonomy
		SET name = $1, keywords = $2, active = $3
		WHERE id = $4`,
		t.Name, t.Keywords, t.Active, t.ID)
	return err
}

// DeleteTaxonomy remove uma entrada da taxonomia.
func (s *SQLStore) DeleteTaxonomy(id int64) error {
	_, err := s.db.Exec(`DELETE FROM taxonomy WHERE id = $1`, id)
	return err
}

// SetTaxonomyStatus aprova ou rejeita uma entrada pendente.
// status: 'approved' | 'rejected'
func (s *SQLStore) SetTaxonomyStatus(id int64, status string) error {
	_, err := s.db.Exec(`
		UPDATE taxonomy SET status = $1, active = ($1 = 'approved') WHERE id = $2`,
		status, id)
	return err
}

// ListPendingTaxonomy retorna entradas com status='pending' (descobertas pelo crawler/LLM).
func (s *SQLStore) ListPendingTaxonomy() ([]models.Taxonomy, error) {
	var out []models.Taxonomy
	err := s.db.Select(&out, `
		SELECT id, type, name, slug, keywords, parent_id, detect_count,
		       last_detected_at, active, status, source, sample_text, created_at
		FROM taxonomy WHERE status = 'pending' ORDER BY detect_count DESC, created_at DESC`)
	return out, err
}

// DetectAndUpsertTaxonomy é o ponto de integração para crawler/categorizador.
// Recebe um texto (ex: nome de produto) e:
//   1. Busca matches contra keywords das taxonomias aprovadas → incrementa detect_count
//   2. Retorna IDs das taxonomias matchadas para uso em score
// Não cria pendentes — isso fica para um job LLM separado.
func (s *SQLStore) DetectAndUpsertTaxonomy(text string) ([]int64, error) {
	if text == "" {
		return nil, nil
	}
	var ids []int64
	// Match normalizado: lower + unaccent dos dois lados.
	// "Fogão" (keyword) bate com "FOGAO" (título), evita duplicatas na taxonomia.
	// Word-boundary match via regex PostgreSQL (\m = início de palavra, \M = fim de palavra).
	// "acer" NÃO bate em "racer" porque 'r' antes de 'acer' não é início de palavra.
	err := s.db.Select(&ids, `
		WITH matched AS (
			SELECT id FROM taxonomy
			WHERE status = 'approved' AND active = TRUE
			  AND EXISTS (
			    SELECT 1 FROM unnest(keywords) AS kw
			    WHERE lower(unaccent($1)) ~ ('\m' || lower(unaccent(kw)) || '\M')
			  )
		)
		UPDATE taxonomy SET detect_count = detect_count + 1, last_detected_at = now()
		WHERE id IN (SELECT id FROM matched)
		RETURNING id`, text)
	return ids, err
}

// GetTaxonomy retorna uma entrada de taxonomia por ID.
func (s *SQLStore) GetTaxonomy(id int64) (*models.Taxonomy, error) {
	var t models.Taxonomy
	err := s.db.Get(&t, `SELECT * FROM taxonomy WHERE id = $1`, id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

// GetTaxonomyByIDs retorna as entradas de taxonomia para os IDs fornecidos.
func (s *SQLStore) GetTaxonomyByIDs(ids []int64) ([]models.Taxonomy, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var out []models.Taxonomy
	q, args, err := sqlx.In(`SELECT * FROM taxonomy WHERE id IN (?)`, ids)
	if err != nil {
		return nil, err
	}
	q = s.db.Rebind(q)
	err = s.db.Select(&out, q, args...)
	return out, err
}

// SuggestTaxonomyCandidate cria entrada pending a partir de texto não-categorizado.
// Usado pelo job LLM quando produto não bate com nenhuma taxonomia aprovada.
func (s *SQLStore) SuggestTaxonomyCandidate(taxType, name string, keywords []string, sampleText, source string) (int64, error) {
	slug := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), " ", "-"))
	t := models.Taxonomy{
		Type:       taxType,
		Name:       name,
		Slug:       slug,
		Keywords:   pq.StringArray(keywords),
		Active:     false,
		Status:     "pending",
		Source:     source,
		SampleText: models.NullString{NullString: sql.NullString{String: sampleText, Valid: sampleText != ""}},
	}
	return s.CreateTaxonomy(t)
}

// sourceAliases mapeia nomes de display para todos os valores armazenados pelo crawler.
func sourceAliases(s string) []string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "amazon":
		return []string{"amazon", "amz"}
	case "mercadolivre":
		return []string{"mercadolivre", "ml", "mercado_livre", "mercado livre"}
	case "magalu":
		return []string{"magalu", "magazine_luiza", "magazineluiza"}
	case "shopee":
		return []string{"shopee"}
	case "aliexpress":
		return []string{"aliexpress", "ali"}
	case "kabum":
		return []string{"kabum"}
	case "americanas":
		return []string{"americanas", "americanas.com"}
	case "casasbahia":
		return []string{"casasbahia", "casas_bahia", "casas bahia"}
	default:
		return []string{s}
	}
}

// FilterCatalogProducts executa busca com filtros combinados.
func (s *SQLStore) FilterCatalogProducts(f CatalogFilters) ([]models.CatalogProduct, int64, error) {
	var args []any
	idx := 1

	base := `FROM catalogproduct WHERE 1=1`

	if !f.IncludeInactive {
		base += ` AND inactive = FALSE`
	}
	if f.Search != "" {
		pattern := "%" + f.Search + "%"
		base += fmt.Sprintf(` AND (canonical_name ILIKE $%d OR tags::text ILIKE $%d OR brand ILIKE $%d)`, idx, idx, idx)
		args = append(args, pattern)
		idx++
	}
	if f.Source != "" {
		aliases := sourceAliases(f.Source)
		placeholders := make([]string, len(aliases))
		for i, a := range aliases {
			placeholders[i] = fmt.Sprintf("$%d", idx)
			args = append(args, a)
			idx++
		}
		base += ` AND lowest_price_source IN (` + strings.Join(placeholders, ",") + `)`
	}
	if f.Tag != "" {
		tagJSON, _ := json.Marshal([]string{f.Tag})
		base += fmt.Sprintf(` AND tags @> $%d::jsonb`, idx)
		args = append(args, string(tagJSON))
		idx++
	}
	if f.Brand != "" {
		base += fmt.Sprintf(` AND brand ILIKE $%d`, idx)
		args = append(args, "%"+f.Brand+"%")
		idx++
	}
	if f.PrimaryCategory != "" {
		base += fmt.Sprintf(` AND EXISTS (
			SELECT 1 FROM catalogproduct_taxonomy cpt
			INNER JOIN taxonomy t ON t.id = cpt.taxonomy_id
			WHERE cpt.product_id = catalogproduct.id AND cpt.role = 'primary_category' AND t.name = $%d)`, idx)
		args = append(args, f.PrimaryCategory)
		idx++
	}
	if f.Subcategory != "" {
		base += fmt.Sprintf(` AND EXISTS (
			SELECT 1 FROM catalogproduct_taxonomy cpt
			INNER JOIN taxonomy t ON t.id = cpt.taxonomy_id
			WHERE cpt.product_id = catalogproduct.id AND cpt.role = 'subcategory' AND t.name = $%d)`, idx)
		args = append(args, f.Subcategory)
		idx++
	}
	switch f.Status {
	case "novos":
		base += ` AND curation_status = 'pending'`
	case "curados":
		base += ` AND curation_status IN ('curated', 'auto')`
	}

	// total
	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := s.db.Get(&total, `SELECT COUNT(*) `+base, countArgs...); err != nil {
		return nil, 0, err
	}

	// items
	query := `SELECT * ` + base + ` ORDER BY updated_at DESC`
	query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, idx, idx+1)
	args = append(args, f.Limit, f.Offset)

	var out []models.CatalogProduct
	if err := s.db.Select(&out, query, args...); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// ListPendingCurationProducts retorna produtos com curation_status='pending' (aguardando categorização).
func (s *SQLStore) ListPendingCurationProducts(limit int) ([]models.CatalogProduct, error) {
	var out []models.CatalogProduct
	err := s.db.Select(&out, `
		SELECT * FROM catalogproduct
		WHERE curation_status = 'pending'
		ORDER BY created_at DESC
		LIMIT $1`, limit)
	return out, err
}

// ListTaxonomyPatterns retorna padrões de taxonomy filtrados por IDs e kinds.
func (s *SQLStore) ListTaxonomyPatterns(taxonomyIDs []int64, kinds []string) ([]models.TaxonomyPattern, error) {
	var out []models.TaxonomyPattern
	query := `
		SELECT id, taxonomy_id, kind, value, weight, locale, source, active, created_at, updated_at
		FROM taxonomy_pattern
		WHERE 1=1`
	args := []interface{}{}

	if len(taxonomyIDs) > 0 {
		query += ` AND taxonomy_id = ANY($` + strconv.Itoa(len(args)+1) + `)`
		args = append(args, pq.Array(taxonomyIDs))
	}

	if len(kinds) > 0 {
		query += ` AND kind = ANY($` + strconv.Itoa(len(args)+1) + `)`
		args = append(args, pq.Array(kinds))
	}

	query += ` ORDER BY created_at DESC`

	err := s.db.Select(&out, query, args...)
	return out, err
}

// ListAllActivePatterns retorna todos os padrões ativos de taxonomy.
func (s *SQLStore) ListAllActivePatterns() ([]models.TaxonomyPattern, error) {
	var out []models.TaxonomyPattern
	err := s.db.Select(&out, `
		SELECT id, taxonomy_id, kind, value, weight, locale, source, active, created_at, updated_at
		FROM taxonomy_pattern
		WHERE active = true
		ORDER BY created_at DESC`)
	return out, err
}

// MaxTaxonomyPatternUpdatedAt retorna o timestamp mais recente de atualização em taxonomy_pattern.
func (s *SQLStore) MaxTaxonomyPatternUpdatedAt() (time.Time, error) {
	var maxTime *time.Time
	err := s.db.Get(&maxTime, `SELECT MAX(updated_at) FROM taxonomy_pattern`)
	if err != nil {
		return time.Time{}, err
	}
	if maxTime == nil {
		return time.Time{}, nil
	}
	return *maxTime, nil
}

// UpsertProductTaxonomy insere ou atualiza um link de produto para taxonomy (role, confidence, source).
func (s *SQLStore) UpsertProductTaxonomy(productID, taxonomyID int64, role string, confidence float64, source string) error {
	_, err := s.db.Exec(`
		INSERT INTO catalogproduct_taxonomy (product_id, taxonomy_id, role, confidence, source, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (product_id, taxonomy_id) DO UPDATE SET
			role = EXCLUDED.role,
			confidence = EXCLUDED.confidence,
			source = EXCLUDED.source`, productID, taxonomyID, role, confidence, source)
	return err
}

// ListProductTaxonomies retorna todas as taxonomias associadas a um produto.
func (s *SQLStore) ListProductTaxonomies(productID int64) ([]models.CatalogProductTaxonomy, error) {
	var out []models.CatalogProductTaxonomy
	err := s.db.Select(&out, `
		SELECT product_id, taxonomy_id, role, confidence, source, created_at
		FROM catalogproduct_taxonomy
		WHERE product_id = $1
		ORDER BY confidence DESC, created_at DESC`, productID)
	return out, err
}

// MarkAutoMatchFalsePositive marca um auto_match_log como falso positivo com motivo.
func (s *SQLStore) MarkAutoMatchFalsePositive(logID int64, reason string) error {
	_, err := s.db.Exec(`
		UPDATE auto_match_logs
		SET false_positive = true,
		    false_positive_reason = $1,
		    false_positive_marked_at = NOW()
		WHERE id = $2`, reason, logID)
	return err
}

// ListFalsePositiveLogs retorna logs de auto_match marcados como falso positivo nos últimos N dias.
func (s *SQLStore) ListFalsePositiveLogs(sinceDays int) ([]models.AutoMatchLog, error) {
	var out []models.AutoMatchLog
	err := s.db.Select(&out, `
		SELECT id, product_id, channel_id, dispatch_id, score, created_at,
		       COALESCE(score_breakdown, '{}'::jsonb) AS score_breakdown,
		       COALESCE(match_reasons, '{}'::text[]) AS match_reasons,
		       false_positive, false_positive_reason, false_positive_marked_at
		FROM auto_match_logs
		WHERE false_positive = true AND false_positive_marked_at >= NOW() - INTERVAL '1 day' * $1
		ORDER BY false_positive_marked_at DESC`, sinceDays)
	return out, err
}

// UpdateAutoMatchScoreBreakdown atualiza score_breakdown e match_reasons de um log.
func (s *SQLStore) UpdateAutoMatchScoreBreakdown(logID int64, breakdown []byte, reasons []string) error {
	_, err := s.db.Exec(`
		UPDATE auto_match_logs
		SET score_breakdown = $1,
		    match_reasons = $2
		WHERE id = $3`, breakdown, pq.Array(reasons), logID)
	return err
}

// UpdateProductAttributesJSON atualiza o campo attributes (JSONB) de um produto.
func (s *SQLStore) UpdateProductAttributesJSON(productID int64, attrs []byte) error {
	_, err := s.db.Exec(`
		UPDATE catalogproduct
		SET attributes = $1
		WHERE id = $2`, attrs, productID)
	return err
}

// CountChannelClicksLast30d conta cliques de um canal nos últimos 30 dias.
func (s *SQLStore) CountChannelClicksLast30d(channelID int64) (int, error) {
	var count int
	err := s.db.Get(&count, `
		SELECT COUNT(*)
		FROM shortlink_clicks
		WHERE channel_id = $1 AND clicked_at > now() - interval '30 days'
	`, channelID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return count, err
}

// GetVariantBySourceSubID retorna uma variante por source e sub_id.
func (s *SQLStore) GetVariantBySourceSubID(source, subid string) (models.CatalogVariant, bool, error) {
	var v models.CatalogVariant
	err := s.db.Get(&v, `
		SELECT id, product_id, source, source_sub_id, url, title, short_id,
		       price, discount, discount_pct, stock, is_available, specs,
		       created_at, updated_at
		FROM catalogvariant
		WHERE source = $1 AND source_sub_id = $2
		LIMIT 1`, source, subid)
	if err == sql.ErrNoRows {
		return v, false, nil
	}
	return v, err == nil, err
}
