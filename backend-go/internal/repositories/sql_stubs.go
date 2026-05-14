package repositories

// sql_stubs.go — implementações stub para métodos da interface Store que foram
// associados a tabelas v1 removidas em unify-v1-v2. Garantem compilação sem
// remover a interface (que ainda é referenciada por handlers e tests).

import (
	"context"
	"math/rand"
	"time"

	"snatcher/backendv2/internal/models"
)


// ---- Clicks / products ----

func (s *SQLStore) CountClicksByProduct(productID int64) (int64, error) { return 0, nil }
func (s *SQLStore) InsertPriceHistoryV2(h models.PriceHistoryV2) error                    { return nil }
func (s *SQLStore) ListPriceHistoryV2(variantID int64) ([]models.PriceHistoryV2, error)   { return nil, nil }
func (s *SQLStore) GetVariantStats(variantID int64, windowDays int) (*models.VariantStats, error) { return nil, nil }

// ---- ShortLinks ----

func (s *SQLStore) GetOrCreateShortLink(destURL, source string) (string, error) {
	// Tenta buscar shortlink existente para a URL
	var existing string
	if err := s.db.Get(&existing, `SELECT short_id FROM short_links WHERE dest_url=$1`, destURL); err == nil && existing != "" {
		return existing, nil
	}
	// Cria novo shortlink com ID aleatório (8 chars base62)
	shortID := randomShortID(8)
	var returned string
	err := s.db.QueryRow(`
		INSERT INTO short_links (short_id, dest_url, source) VALUES ($1, $2, $3)
		ON CONFLICT (dest_url) DO UPDATE SET short_id = short_links.short_id
		RETURNING short_id
	`, shortID, destURL, source).Scan(&returned)
	if err == nil && returned != "" {
		return returned, nil
	}
	return shortID, err
}

// randomShortID gera um ID aleatório base62 de n caracteres.
func randomShortID(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	r := rand.New(rand.NewSource(time.Now().UnixNano())) //nolint:gosec
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[r.Intn(len(chars))]
	}
	return string(b)
}

func (s *SQLStore) GetShortLinkByID(shortID string) (destURL string, source string, found bool) {
	var r struct {
		DestURL string `db:"dest_url"`
		Source  string `db:"source"`
	}
	if err := s.db.Get(&r, `UPDATE short_links SET click_count=click_count+1 WHERE short_id=$1 RETURNING dest_url, source`, shortID); err == nil {
		return r.DestURL, r.Source, true
	}
	return "", "", false
}

func (s *SQLStore) PeekShortLinkByID(shortID string) (destURL string, source string, found bool) {
	// 1. short_links — links do Composer/manual
	var r struct {
		DestURL string `db:"dest_url"`
		Source  string `db:"source"`
	}
	if err := s.db.Get(&r, `SELECT dest_url, source FROM short_links WHERE short_id=$1`, shortID); err == nil {
		return r.DestURL, r.Source, true
	}
	// 2. group_shortlinks — links do auto-dispatch (ensure_group_shortlink)
	var canonicalURL string
	if err := s.db.Get(&canonicalURL, `
		SELECT c.canonical_url FROM group_shortlinks gs
		JOIN catalog c ON c.id = gs.catalog_id
		WHERE gs.short_id = $1 AND c.canonical_url IS NOT NULL
		LIMIT 1
	`, shortID); err == nil && canonicalURL != "" {
		return canonicalURL, "auto", true
	}
	return "", "", false
}
func (s *SQLStore) GetShortIDByURL(url string) string { return "" }
func (s *SQLStore) IncrementShortLinkClickCount(shortID string)      {}

// ---- Taxonomy ----

func (s *SQLStore) DetectAndUpsertTaxonomy(text string) ([]int64, error) { return nil, nil }
func (s *SQLStore) GetTaxonomy(id int64) (*models.Taxonomy, error) { return nil, nil }
func (s *SQLStore) GetTaxonomyByIDs(ids []int64) ([]models.Taxonomy, error) { return nil, nil }
func (s *SQLStore) ListTaxonomy(taxType string) ([]models.Taxonomy, error) { return nil, nil }
func (s *SQLStore) ListAllActivePatterns() ([]models.TaxonomyPattern, error)  { return nil, nil }
func (s *SQLStore) ListPendingTaxonomy() ([]models.Taxonomy, error) { return nil, nil }
func (s *SQLStore) ListTaxonomyWithParent(taxType string, parentID *int64) ([]models.Taxonomy, error) {
	return nil, nil
}
func (s *SQLStore) ListTaxonomyPatterns(taxonomyIDs []int64, kinds []string) ([]models.TaxonomyPattern, error) {
	return nil, nil
}
func (s *SQLStore) MaxTaxonomyPatternUpdatedAt() (time.Time, error) { return time.Time{}, nil }
func (s *SQLStore) CreateTaxonomy(t models.Taxonomy) (int64, error) { return 0, nil }
func (s *SQLStore) UpdateTaxonomy(t models.Taxonomy) error          { return nil }
func (s *SQLStore) DeleteTaxonomy(id int64) error                   { return nil }
func (s *SQLStore) SetTaxonomyStatus(id int64, status string) error { return nil }
func (s *SQLStore) IncrementTaxonomyDetect(id int64) error          { return nil }
func (s *SQLStore) SuggestTaxonomyCandidate(taxType, name string, keywords []string, sampleText, source string) (int64, error) {
	return 0, nil
}
func (s *SQLStore) UpsertProductTaxonomy(productID, taxonomyID int64, role string, confidence float64, source string) error {
	return nil
}

// ---- Affiliates ----

func (s *SQLStore) CreateAffiliate(a models.Affiliate) (int64, error)             { return 0, nil }
func (s *SQLStore) UpdateAffiliate(a models.Affiliate) error                      { return nil }
func (s *SQLStore) DeleteAffiliate(id int64) error                                { return nil }
func (s *SQLStore) GetAffiliate(id int64) (models.Affiliate, error)               { return models.Affiliate{}, nil }
func (s *SQLStore) GetAffiliateBySource(sourceID string) (models.Affiliate, bool, error) { return models.Affiliate{}, false, nil }
func (s *SQLStore) ListAffiliates(sourceID *string) ([]models.Affiliate, error) { return nil, nil }
func (s *SQLStore) InsertAffiliateConversion(c models.AffiliateConversion) (int64, error) { return 0, nil }


// ---- PublicLinks ----

func (s *SQLStore) GetPublicLink(id int64) (models.PublicLink, error) { return models.PublicLink{}, nil }
func (s *SQLStore) GetPublicLinkBySlug(slug string) (models.PublicLink, error) {
	return models.PublicLink{}, nil
}
func (s *SQLStore) ListPublicLinks() ([]models.PublicLink, error) { return nil, nil }
func (s *SQLStore) CreatePublicLink(l models.PublicLink) (int64, error)            { return 0, nil }
func (s *SQLStore) UpdatePublicLink(l models.PublicLink) error                     { return nil }
func (s *SQLStore) DeletePublicLink(id int64) error                                { return nil }
func (s *SQLStore) IncrementPublicLinkClicks(id int64) error                       { return nil }
func (s *SQLStore) IncrementRoundRobinIdx(id int64, newIdx int) error { return nil }

// ---- GroupSpies ----

func (s *SQLStore) CreateGroupSpy(g models.GroupSpy) (int64, error)          { return 0, nil }
func (s *SQLStore) GetGroupSpy(id int64) (models.GroupSpy, error)            { return models.GroupSpy{}, nil }
func (s *SQLStore) ListGroupSpies(platform string, activeOnly bool) ([]models.GroupSpy, error) { return nil, nil }
func (s *SQLStore) UpdateGroupSpyReader(id int64, readerWAID, readerTGID models.NullInt64) error { return nil }
func (s *SQLStore) SoftDeleteGroupSpy(id int64) error                        { return nil }
func (s *SQLStore) CreateSpyMessage(m models.SpyMessage) error               { return nil }
func (s *SQLStore) ListSpyMessages(spyID int64, limit int) ([]models.SpyMessage, error) {
	return nil, nil
}

// ---- Clusters ----

func (s *SQLStore) GetCluster(id int64) (models.Cluster, error)        { return models.Cluster{}, nil }
func (s *SQLStore) ListClusters() ([]models.Cluster, error)            { return nil, nil }
func (s *SQLStore) UpsertClusters(clusters []models.Cluster) error { return nil }

// ---- Dispatch / send queue stubs ----

func (s *SQLStore) CountPendingTargetsByGroup() ([]GroupDeliveryCount, error) { return nil, nil }
func (s *SQLStore) CountRecentDeliveriesByGroup(minutes int) ([]GroupDeliveryCount, error) {
	return nil, nil
}

// ---- Catalog / product ----

func (s *SQLStore) DeactivateCatalogProductsWithoutPrice() (int64, error) { return 0, nil }
func (s *SQLStore) IncrementProductFailures(id int64) error             { return nil }
func (s *SQLStore) ResetProductFailures(id int64) error                 { return nil }
func (s *SQLStore) UpdateProductAttributesJSON(productID int64, attrs []byte) error { return nil }
func (s *SQLStore) InsertDiscardedItem(r models.CrawlResult, payload []byte, reason string) error {
	return nil
}
func (s *SQLStore) InsertRawItem(r models.CrawlResult, payload []byte) error { return nil }

// ---- Sent / curation ----

func (s *SQLStore) RecordSent(msg models.SentMessageV2) error { return nil }
func (s *SQLStore) WasSentRecently(productID, targetID int64, since time.Time) (bool, error) {
	return false, nil
}
func (s *SQLStore) SetCurationHeuristicCheckpoint(at time.Time, lastProductID int64) error { return nil }
func (s *SQLStore) SetAutoMatchProductCursor(cursor int64) error { return nil }

// ---- unused imports guard ----
var _ context.Context
var _ time.Time
