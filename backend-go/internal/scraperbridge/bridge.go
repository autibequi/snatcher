// Package scraperbridge adapts registry scrapers (models.CrawlResult) to the legacy
// pipeline.Scraper interface ([]pipeline.Item) and builds the full map used by the crawler.
package scraperbridge

import (
	"context"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/scrapers"
)

// RegistryAdapter wraps scrapers.Scraper (registry) as pipeline.Scraper and pipeline.ScraperWithCategory
// so category filters (ecommerce vs cdkey) apply during crawl.
type RegistryAdapter struct {
	S scrapers.Scraper
}

// ID implements pipeline.ScraperWithCategory.
func (a RegistryAdapter) ID() string { return a.S.ID() }

// Category implements pipeline.ScraperWithCategory.
func (a RegistryAdapter) Category() string { return a.S.Category() }

// Search implements pipeline.Scraper.
func (a RegistryAdapter) Search(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	crs, err := a.S.Search(ctx, query, minVal, maxVal)
	if err != nil {
		return nil, err
	}
	return CrawlResultsToItems(crs), nil
}

// CrawlResultsToItems maps DB-oriented results to pipeline items (crawl.go overwrites Source per term).
func CrawlResultsToItems(crs []models.CrawlResult) []pipeline.Item {
	out := make([]pipeline.Item, 0, len(crs))
	for _, cr := range crs {
		img := ""
		if cr.ImageURL.Valid {
			img = cr.ImageURL.String
		}
		sub := ""
		if cr.SourceSubID.Valid {
			sub = cr.SourceSubID.String
		}
		src := cr.Source
		if src == "" {
			src = "unknown"
		}
		meta := cr.Metadata
		if len(meta) == 0 {
			meta = nil
		}
		out = append(out, pipeline.Item{
			Title:       cr.Title,
			Price:       cr.Price,
			URL:         cr.URL,
			ImageURL:    img,
			Source:      src,
			SourceSubID: sub,
			Metadata:    meta,
		})
	}
	return out
}

// BuildPipelineScraperMap merges credential-backed ML/AMZ with every other scraper from the global registry.
// Registry entries for "ml" and "amz" are skipped so the injected instances (with ML API keys) win.
func BuildPipelineScraperMap(ml pipeline.Scraper, amz pipeline.Scraper) map[string]pipeline.Scraper {
	m := map[string]pipeline.Scraper{
		"ml":  ml,
		"amz": amz,
	}
	for _, s := range scrapers.All() {
		id := s.ID()
		if id == "ml" || id == "amz" {
			continue
		}
		m[id] = RegistryAdapter{S: s}
	}
	return m
}
