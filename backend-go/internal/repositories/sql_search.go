package repositories

import (
	"snatcher/backendv2/internal/models"
)

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
		INSERT INTO searchterm (query, queries, min_val, max_val, sources, category, active, crawl_interval, inbox_muted)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		t.Query, t.Queries, t.MinVal, t.MaxVal, t.Sources, t.Category, t.Active, t.CrawlInterval, t.InboxMuted,
	).Scan(&id)
	return id, err
}

func (s *SQLStore) UpdateSearchTerm(t models.SearchTerm) error {
	_, err := s.db.Exec(`
		UPDATE searchterm SET query=$1, queries=$2, min_val=$3, max_val=$4,
			sources=$5, category=$6, active=$7, crawl_interval=$8, inbox_muted=$9
		WHERE id = $10`,
		t.Query, t.Queries, t.MinVal, t.MaxVal, t.Sources, t.Category, t.Active, t.CrawlInterval, t.InboxMuted, t.ID,
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
