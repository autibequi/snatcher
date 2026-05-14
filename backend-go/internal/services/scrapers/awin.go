package scrapers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"snatcher/backendv2/internal/models"
	"time"
)

// awinScraper implements the Scraper interface for AWIN affiliate network.
//
// AWIN is a multi-merchant affiliate network that aggregates offers from hundreds of retailers
// (Adidas, Nike, Amazon, etc.). Each CrawlResult carries a source_subid identifying the actual
// merchant, enabling fan-out queries like "show me airfryer offers across all AWIN merchants".
//
// Configuration (via environment or config):
//   - AWIN_API_KEY: API key from AWIN (fail-fast if missing)
//   - AWIN_PUBLISHER_ID: Publisher/Account ID for affiliate tracking
type awinScraper struct {
	client        *http.Client
	apiKey        string
	publisherID   string
	deepLinkDomain string // For generating affiliate deeplinks
}

// awinMerchant represents a single AWIN merchant in the response.
type awinMerchant struct {
	MerchantID   int64  `json:"merchant_id"`
	MerchantName string `json:"merchant_name"`
	Logo         string `json:"logo,omitempty"`
	DefaultCPC   string `json:"default_cpc,omitempty"`
}

// awinProduct represents a product offer from AWIN API.
type awinProduct struct {
	ProductName  string       `json:"product_name"`
	ProductPrice float64      `json:"product_price"`
	ProductID    string       `json:"product_id"`
	ProductImage string       `json:"product_image,omitempty"`
	DeepLink     string       `json:"deeplink"`
	MerchantInfo awinMerchant `json:"merchant"`
	CommissionGroup string    `json:"commission_group,omitempty"`
}

// awinResponse wraps the API response.
type awinResponse struct {
	Products []awinProduct `json:"products"`
	Total    int           `json:"total"`
	Status   string        `json:"status"`
}

// ID returns the unique identifier for this scraper.
func (s *awinScraper) ID() string {
	return "awin"
}

// Category returns the source category.
func (s *awinScraper) Category() string {
	return "ecommerce"
}

// Search executes a marketplace search on AWIN affiliate network with price range filtering.
// Returns multiple CrawlResult entries, each with a distinct source_subid (merchant).
// Requires AWIN_API_KEY and AWIN_PUBLISHER_ID environment variables.
func (s *awinScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// Verify credentials are loaded
	if s.apiKey == "" || s.publisherID == "" {
		return nil, fmt.Errorf("AWIN: missing API_KEY or PUBLISHER_ID; set AWIN_API_KEY and AWIN_PUBLISHER_ID environment variables")
	}

	// AWIN API endpoint for product search
	// Using affiliate search endpoint with currency BRL for Brazil
	apiURL := fmt.Sprintf(
		"https://api.awin.com/publishers/%s/products?search=%s&currency=BRL&limit=100",
		s.publisherID,
		url.QueryEscape(query),
	)

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	// AWIN API authentication via header
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.apiKey))
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AWIN API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AWIN API returned status %d", resp.StatusCode)
	}

	var awinResp awinResponse
	if err := json.NewDecoder(resp.Body).Decode(&awinResp); err != nil {
		return nil, fmt.Errorf("failed to parse AWIN response: %w", err)
	}

	var results []models.CrawlResult

	for _, product := range awinResp.Products {
		// Check price range filter
		if product.ProductPrice < minVal || product.ProductPrice > maxVal {
			continue
		}

		// Each product gets a CrawlResult with source_subid = merchant_id (or merchant_name)
		// This enables queries like "show me X across all merchants"
		subID := fmt.Sprintf("%d", product.MerchantInfo.MerchantID)
		if product.MerchantInfo.MerchantName != "" {
			subID = product.MerchantInfo.MerchantName
		}

		result := models.CrawlResult{
			Title:        product.ProductName,
			Price:        product.ProductPrice,
			URL:          product.DeepLink, // Use AWIN deeplink for affiliate tracking
			ImageURL:     nullableString(product.ProductImage),
			Source:       "awin",
			SourceSubID:  nullableString(subID), // Merchant identifier
			CrawledAt:    time.Now(),
		}

		results = append(results, result)
	}

	return results, nil
}

// init registers the awinScraper in the global registry.
func init() {
	// Load credentials from environment (fail-safe: can be empty at startup)
	apiKey := os.Getenv("AWIN_API_KEY")
	publisherID := os.Getenv("AWIN_PUBLISHER_ID")

	Register(&awinScraper{
		client:         &http.Client{Timeout: 15 * time.Second},
		apiKey:         apiKey,
		publisherID:    publisherID,
		deepLinkDomain: "https://www.awin1.com/",
	})
}
