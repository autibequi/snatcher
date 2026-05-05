// Package scrapers provides plugin architecture for marketplace sources.
//
// Extension pattern: Each new marketplace source creates a single .go file
// implementing the Scraper interface and calling Register() in its init() function.
//
// Thread-safety: Registry is populated only during init() (single-threaded execution).
// No mutex needed—all scrapers must be registered before any goroutine reads the registry.
package scrapers

import (
	"context"
	"snatcher/backendv2/internal/models"
)

// Scraper defines the interface that all marketplace sources must implement.
// Implementations are registered globally and can be queried by ID.
type Scraper interface {
	// ID returns the unique identifier for this source (e.g., "ml", "amz").
	ID() string

	// Category returns the source category: "ecommerce" or "cdkey".
	Category() string

	// Search executes a marketplace search with price range filtering.
	// Returns raw crawl results that will be stored in the database.
	Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error)
}

var registry = map[string]Scraper{}

// Register adds a scraper to the global registry.
// Panics if a scraper with the same ID is already registered.
// Must be called from init() of each scraper implementation.
func Register(s Scraper) {
	if _, exists := registry[s.ID()]; exists {
		panic("scraper already registered: " + s.ID())
	}
	registry[s.ID()] = s
}

// Get returns a scraper by ID, or false if not found.
func Get(id string) (Scraper, bool) {
	s, ok := registry[id]
	return s, ok
}

// Enabled returns a filtered list of scrapers for the given IDs.
// Unknown IDs are silently skipped.
func Enabled(ids []string) []Scraper {
	out := []Scraper{}
	for _, id := range ids {
		if s, ok := registry[id]; ok {
			out = append(out, s)
		}
	}
	return out
}

// All returns all registered scrapers.
func All() []Scraper {
	out := make([]Scraper, 0, len(registry))
	for _, s := range registry {
		out = append(out, s)
	}
	return out
}
