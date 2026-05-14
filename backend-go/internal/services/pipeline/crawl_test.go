package pipeline

import "testing"

// TODO(011/004): Comprehensive category filter tests require mock scrapers and store.
// The category filtering is implemented in CrawlSearchTerm as a type assertion check:
// if categorized, ok := scraper.(ScraperWithCategory); ok { ... }
//
// To test this properly, we would need:
// 1. Mock implementations of ScraperWithCategory
// 2. Mock implementations of store.Store
// 3. Logging capture to verify warning messages
//
// Manual test procedure:
// 1. Create SearchTerm with category="cdkey", sources=["ml","humble"]
// 2. Insert Humble Bundle scraper (implements ScraperWithCategory, category="cdkey")
// 3. Run crawl via /api/search-terms/{id}/crawl
// 4. Verify: SELECT DISTINCT source FROM crawl_result WHERE search_term_id=X
//    Should contain "humble" but NOT "ml" (which is ecommerce)
// 5. Check logs for warning message about source category mismatch for "ml"

func TestCrawlSearchTermCategoryFilter(t *testing.T) {
	t.Skip("Manual test required — see crawl_test.go comments for procedure")
	// TODO: implement once mock infra is available
}
