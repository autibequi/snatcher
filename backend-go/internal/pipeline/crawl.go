package pipeline

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"sync"
	"time"
)

// Item é o resultado bruto de um scraper.
type Item struct {
	Title    string
	Price    float64
	URL      string
	ImageURL string
	Source   string
}

// Scraper é a interface que cada marketplace implementa.
type Scraper interface {
	Search(ctx context.Context, query string, minVal, maxVal float64) ([]Item, error)
}

// ScraperWithCategory extends Scraper with category information.
// New scrapers should implement this for category-based filtering.
type ScraperWithCategory interface {
	Scraper
	ID() string
	Category() string
}

// CrawlSearchTerm executa o crawl de um SearchTerm e salva os resultados.
func CrawlSearchTerm(ctx context.Context, st store.Store, term models.SearchTerm, scrapers map[string]Scraper) error {
	log := slog.With("term_id", term.ID, "query", term.Query)
	log.Info("crawl iniciado", "sources", term.GetSources(), "queries", len(term.GetQueries()))

	logID, err := st.InsertCrawlLog(models.CrawlLog{
		SearchTermID: term.ID,
		Status:       "running",
	})
	if err != nil {
		return fmt.Errorf("insert crawl log: %w", err)
	}

	var (
		mu           sync.Mutex
		allItems     []Item
		sourceCounts map[string]int
		crawlErr     error
	)
	sourceCounts = make(map[string]int)

	queries := term.GetQueries()
	enabledSources := term.GetSources()
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup

	for _, q := range queries {
		for _, sourceID := range enabledSources {
			scraper, exists := scrapers[sourceID]
			if !exists {
				log.Warn("scraper not found", "source", sourceID)
				continue
			}

			// Defense-in-depth: filter sources by category match.
			// If scraper implements ScraperWithCategory, check that it matches the search term's category.
			if categorized, ok := scraper.(ScraperWithCategory); ok {
				if categorized.Category() != term.Category {
					log.Warn("source category mismatch",
						"search_term_id", term.ID,
						"source", sourceID,
						"expected_category", term.Category,
						"got_category", categorized.Category())
					continue
				}
			}

			q, sourceID, scraper := q, sourceID, scraper
			wg.Add(1)
			go func() {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				items, err := scraper.Search(ctx, q, term.MinVal, term.MaxVal)
				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					log.Warn("scraper error", "source", sourceID, "query", q, "err", err)
					return
				}
				for i := range items {
					items[i].Source = sourceID
				}
				allItems = append(allItems, items...)
				sourceCounts[sourceID] += len(items)
			}()
		}
	}
	wg.Wait()

	// Dedup por URL e salvar
	seen := map[string]bool{}
	for _, item := range allItems {
		if seen[item.URL] {
			continue
		}
		already, _ := st.URLAlreadyCrawled(term.ID, item.URL)
		if already {
			seen[item.URL] = true
			continue
		}
		seen[item.URL] = true

		var imgNull models.NullString
		if item.ImageURL != "" {
			imgNull = models.NullString{NullString: sql.NullString{String: item.ImageURL, Valid: true}}
		}
		_, err := st.InsertCrawlResult(models.CrawlResult{
			SearchTermID: term.ID,
			Title:        item.Title,
			Price:        item.Price,
			URL:          item.URL,
			ImageURL:     imgNull,
			Source:       item.Source,
		})
		if err != nil {
			log.Error("insert crawl result", "err", err)
		}
	}

	now := time.Now()
	cl := models.CrawlLog{
		ID:           logID,
		SearchTermID: term.ID,
		FinishedAt:   models.NullTime{NullTime: sql.NullTime{Time: now, Valid: true}},
		MLCount:      sourceCounts["ml"],
		AmzCount:     sourceCounts["amz"],
	}

	// Set source_counts JSON for new source-agnostic tracking
	_ = cl.SetSourceCounts(sourceCounts)

	if crawlErr != nil {
		cl.Status = "error"
		cl.ErrorMsg = models.NullString{NullString: sql.NullString{String: crawlErr.Error(), Valid: true}}
	} else {
		cl.Status = "done"
	}
	_ = st.UpdateCrawlLog(cl)

	// Calculate total items found
	totalItems := 0
	for _, count := range sourceCounts {
		totalItems += count
	}
	_ = st.TouchSearchTerm(term.ID, totalItems)

	if crawlErr != nil {
		log.Error("crawl finalizado com erro", "err", crawlErr)
	} else {
		log.Info("crawl finalizado", "total_itens", totalItems, "por_source", sourceCounts)
	}

	return crawlErr
}

// CrawlAllTerms executa o crawl de todos os SearchTerms ativos.
func CrawlAllTerms(ctx context.Context, st store.Store, scrapers map[string]Scraper) error {
	terms, err := st.ListSearchTerms()
	if err != nil {
		return err
	}

	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup
	for _, term := range terms {
		if !term.Active {
			continue
		}
		term := term
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if err := CrawlSearchTerm(ctx, st, term, scrapers); err != nil {
				slog.Error("crawl term", "term_id", term.ID, "err", err)
			}
		}()
	}
	wg.Wait()
	return nil
}
