package scraperbridge

import (
	"context"
	"database/sql"
	"testing"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
)

func TestCrawlResultsToItems(t *testing.T) {
	crs := []models.CrawlResult{
		{Title: "A", Price: 10, URL: "https://x", Source: "x"},
		{
			Title: "B", Price: 20, URL: "https://y",
			ImageURL:    models.NullString{NullString: sql.NullString{String: "img", Valid: true}},
			SourceSubID: models.NullString{NullString: sql.NullString{String: "sub", Valid: true}},
			Source:      "y",
		},
	}
	items := CrawlResultsToItems(crs)
	if len(items) != 2 {
		t.Fatalf("len=%d", len(items))
	}
	if items[0].Title != "A" || items[0].URL != "https://x" {
		t.Fatalf("first item: %+v", items[0])
	}
}

func TestBuildPipelineScraperMap_IncludesExtraSources(t *testing.T) {
	m := BuildPipelineScraperMap(
		pipelineStub{name: "ml"},
		pipelineStub{name: "amz"},
	)
	if m["ml"] == nil || m["amz"] == nil {
		t.Fatal("missing ml/amz")
	}
	// At least one registry-only source must appear after wiring (e.g. shopee, magalu).
	if m["shopee"] == nil {
		t.Fatal("expected shopee scraper in merged map — registry may have changed")
	}
	if m["magalu"] == nil {
		t.Fatal("expected magalu scraper in merged map")
	}
	if m["kabum"] == nil {
		t.Fatal("expected kabum scraper in merged map")
	}
}

type pipelineStub struct{ name string }

func (p pipelineStub) Search(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	return nil, nil
}
