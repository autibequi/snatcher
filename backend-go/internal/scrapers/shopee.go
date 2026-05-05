package scrapers

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"snatcher/backendv2/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const shopeeBaseURL = "https://shopee.com.br"

// shopeeScraper implements the Scraper interface for Shopee marketplace.
type shopeeScraper struct {
	client *http.Client
}

// ID returns the unique identifier for this scraper.
func (s *shopeeScraper) ID() string {
	return "shopee"
}

// Category returns the source category.
func (s *shopeeScraper) Category() string {
	return "ecommerce"
}

// Search implements the Scraper interface, returning models.CrawlResult.
// It attempts API GraphQL/REST first, then falls back to HTML scraping.
func (s *shopeeScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// Try API first (with backoff on 429)
	results, err := s.searchAPI(ctx, query, minVal, maxVal)
	if err == nil && len(results) > 0 {
		return results, nil
	}

	// Fallback to HTML scraping
	return s.searchHTML(ctx, query, minVal, maxVal)
}

// searchAPI attempts to use Shopee's REST API.
func (s *shopeeScraper) searchAPI(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// Shopee BR API endpoint for search
	endpoint := fmt.Sprintf(
		"%s/api/v4/search/search_items?by=relevancy&keyword=%s&limit=30&newest=0&order=desc&page_type=search",
		shopeeBaseURL,
		url.QueryEscape(query),
	)

	req, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")

	// Attempt with exponential backoff on 429
	var resp *http.Response
	for attempt := 0; attempt < 3; attempt++ {
		var err error
		resp, err = s.client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		if resp.StatusCode != 429 {
			break
		}

		// Exponential backoff on rate limit
		backoff := time.Duration(math.Pow(2, float64(attempt))+rand.Float64()) * time.Second
		time.Sleep(backoff)
	}

	// API may not be easily parseable (JSON structure varies), so fallback is expected
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("shopee api status %d", resp.StatusCode)
	}

	// For now, return empty to trigger HTML fallback (API structure is complex)
	// In production, would parse JSON response here
	return nil, fmt.Errorf("shopee api response requires parsing")
}

// searchHTML scrapes Shopee listing page via goquery.
func (s *shopeeScraper) searchHTML(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	searchURL := fmt.Sprintf("%s/search?keyword=%s", shopeeBaseURL, url.QueryEscape(query))

	req, _ := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("shopee html status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var results []models.CrawlResult

	// Shopee uses React, so selectors may be fragile
	// Primary selector for product cards (adjust based on actual HTML structure)
	doc.Find("div[data-sqe='product']").Each(func(_ int, sel *goquery.Selection) {
		// Extract title
		title := strings.TrimSpace(sel.Find("div._3qjA2z").First().Text())
		if title == "" {
			// Fallback selector
			title = strings.TrimSpace(sel.Find("span").First().Text())
		}

		// Extract price
		priceText := strings.TrimSpace(sel.Find("span._8TIVLo").First().Text())
		priceText = strings.ReplaceAll(priceText, "R$", "")
		priceText = strings.ReplaceAll(priceText, " ", "")
		priceText = strings.ReplaceAll(priceText, ".", "")
		priceText = strings.ReplaceAll(priceText, ",", ".")
		price, _ := strconv.ParseFloat(priceText, 64)

		// Extract product URL
		link, _ := sel.Find("a").First().Attr("href")
		if link != "" && !strings.HasPrefix(link, "http") {
			link = shopeeBaseURL + link
		}

		// Extract image URL
		img, _ := sel.Find("img").First().Attr("src")

		// Validate and filter by price range
		if title == "" || price == 0 || link == "" {
			return
		}
		if price < minVal || price > maxVal {
			return
		}

		// TODO: integrar shopee-affiliate-link-generator se template estiver disponível

		results = append(results, models.CrawlResult{
			Title:     title,
			Price:     price,
			URL:       link,
			ImageURL:  nullableStringShopee(img),
			Source:    "shopee",
			CrawledAt: time.Now(),
		})
	})

	return results, nil
}

// nullableString converts a string to a models.NullString.
func nullableStringShopee(s string) models.NullString {
	return models.NullString{
		NullString: sql.NullString{String: s, Valid: s != ""},
	}
}

// init registers the shopeeScraper in the global registry.
func init() {
	Register(&shopeeScraper{
		client: &http.Client{Timeout: 20 * time.Second},
	})
}
