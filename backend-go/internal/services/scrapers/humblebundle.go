package scrapers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"snatcher/backendv2/internal/models"
	"strings"
	"time"
)

// humbleBundleScraper implements the Scraper interface for Humble Bundle.
// Humble Bundle offers game keys, bundles, and software.
// This scraper focuses on individual game items (not bundles) from the storefront API.
type humbleBundleScraper struct {
	client *http.Client
}

// ID returns the unique identifier for this scraper.
func (s *humbleBundleScraper) ID() string {
	return "humble"
}

// Category returns the source category.
func (s *humbleBundleScraper) Category() string {
	return "cdkey"
}

// Search implements the Scraper interface.
// It uses the public Humble Bundle storefront API to search for games.
// Note: Bundles are ignored in this version (only individual items).
func (s *humbleBundleScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// Humble Bundle API endpoint for storefront lookup
	// ?products=query returns results matching the query
	endpoint := fmt.Sprintf(
		"https://www.humblebundle.com/store/api/lookup?products=%s",
		url.QueryEscape(query),
	)

	req, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Referer", "https://www.humblebundle.com/store")
	req.Header.Set("Origin", "https://www.humblebundle.com")
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	applyPublicSiteHeaders(req)
	optionalScraperCookie(req, "SNATCHER_SCRAPER_HUMBLE_COOKIE")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		prefix := readBodyPrefix(resp, 4096)
		return nil, errHTTPCrawl("humble bundle", resp.StatusCode, prefix)
	}

	// Parse JSON response
	var apiResp struct {
		Results []struct {
			MachineName string  `json:"machine_name"`
			HumanName   string  `json:"human_name"`
			Price       float64 `json:"price"`
			ImageURL    string  `json:"image_url"`
			IsBundle    bool    `json:"is_bundle"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode humble bundle response: %w", err)
	}

	var results []models.CrawlResult

	for _, item := range apiResp.Results {
		// Skip bundles in this version
		// Decision: bundles often have complex pricing (pay-what-you-want) and variable content.
		// Only include individual games for stable pricing and clear product info.
		if item.IsBundle {
			continue
		}

		title := strings.TrimSpace(item.HumanName)
		price := item.Price

		// Validate and filter by price range
		if title == "" || price == 0 {
			continue
		}
		if price < minVal || price > maxVal {
			continue
		}

		// Build affiliate URL with tracking parameter
		// Humble Partner program: append ?partner=<tracking_id> to affiliate links
		// For now, use a generic partner parameter; can be configured per region
		affiliateURL := fmt.Sprintf(
			"https://www.humblebundle.com/store/%s?partner=snatcher",
			url.QueryEscape(item.MachineName),
		)

		results = append(results, models.CrawlResult{
			Title:     title,
			Price:     price,
			URL:       affiliateURL,
			ImageURL:  nullableString(item.ImageURL),
			Source:    "humble",
			CrawledAt: time.Now(),
		})
	}

	return results, nil
}

// init registers the humbleBundleScraper in the global registry.
func init() {
	Register(&humbleBundleScraper{
		client: &http.Client{Timeout: 20 * time.Second},
	})
}
