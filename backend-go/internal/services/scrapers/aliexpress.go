package scrapers

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"snatcher/backendv2/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

// aliexpressScraper implements the Scraper interface for AliExpress marketplace.
// AliExpress is a cross-border Chinese marketplace with competitive pricing on electronics and fashion.
// This implementation uses HTML scraping with geo-pinning for Brazil (BRL pricing).
type aliexpressScraper struct {
	client *http.Client
}

// ID returns the unique identifier for this scraper.
func (s *aliexpressScraper) ID() string {
	return "aliexpress"
}

// Category returns the source category.
func (s *aliexpressScraper) Category() string {
	return "ecommerce"
}

// Search executes a marketplace search on AliExpress with price range filtering.
// Returns crawl results with prices in BRL (Brazil).
func (s *aliexpressScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// AliExpress search URL with price range in BRL
	// Using affiliate-friendly URL structure if available
	searchURL := fmt.Sprintf(
		"https://www.aliexpress.com/wholesale?SearchText=%s&minPrice=%.2f&maxPrice=%.2f&CatId=0",
		url.QueryEscape(query),
		minVal,
		maxVal,
	)

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return nil, err
	}

	// Set headers to appear as Brazilian user and get BRL pricing
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Referer", "https://www.aliexpress.com/")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aliexpress search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aliexpress returned status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse aliexpress response: %w", err)
	}

	var results []models.CrawlResult

	// Parse product cards - AliExpress uses various selectors depending on page layout
	// Try main product container selectors
	doc.Find("div[class*='search-item-card']").Each(func(_ int, sel *goquery.Selection) {
		title := strings.TrimSpace(sel.Find("h2[class*='product-title']").Text())
		if title == "" {
			title = strings.TrimSpace(sel.Find("a[class*='organic-item-title']").Text())
		}

		// Price parsing - AliExpress shows prices in various formats
		priceText := strings.TrimSpace(sel.Find("span[class*='search-price']").Text())
		if priceText == "" {
			priceText = strings.TrimSpace(sel.Find("span[class*='price-main']").Text())
		}

		// Clean price: remove currency symbols, convert to float
		priceText = strings.TrimSpace(priceText)
		priceText = strings.ReplaceAll(priceText, "R$", "")
		priceText = strings.ReplaceAll(priceText, ",", ".")
		priceText = strings.Fields(priceText)[0] // Take first number

		price, err := strconv.ParseFloat(priceText, 64)
		if err != nil || price == 0 {
			return
		}

		// Check price range filter
		if price < minVal || price > maxVal {
			return
		}

		// Extract product link
		link, _ := sel.Find("a[class*='organic-item']").Attr("href")
		if link == "" {
			link, _ = sel.Find("a").First().Attr("href")
		}
		if link != "" && !strings.HasPrefix(link, "http") {
			link = "https://www.aliexpress.com" + link
		}

		// Extract image
		img, _ := sel.Find("img[class*='product-img']").Attr("src")

		if title == "" || link == "" {
			return
		}

		results = append(results, models.CrawlResult{
			Title:     title,
			Price:     price,
			URL:       link,
			ImageURL:  nullableString(img),
			Source:    "aliexpress",
			CrawledAt: time.Now(),
		})
	})

	return results, nil
}

// init registers the aliexpressScraper in the global registry.
func init() {
	Register(&aliexpressScraper{
		client: &http.Client{Timeout: 20 * time.Second},
	})
}
