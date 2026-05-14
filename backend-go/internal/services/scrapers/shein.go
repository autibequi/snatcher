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

// sheinScraper implements the Scraper interface for Shein marketplace.
// Shein is a cross-border Chinese fast-fashion marketplace with aggressive anti-bot protection.
// This implementation starts with HTML scraping; may need Chromium for more complex anti-bot scenarios.
type sheinScraper struct {
	client *http.Client
}

// ID returns the unique identifier for this scraper.
func (s *sheinScraper) ID() string {
	return "shein"
}

// Category returns the source category.
func (s *sheinScraper) Category() string {
	return "ecommerce"
}

// Search executes a marketplace search on Shein with price range filtering.
// Targets the Brazilian subdomain (br.shein.com) for BRL pricing.
func (s *sheinScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// Use Brazilian subdomain with price range in BRL
	searchURL := fmt.Sprintf(
		"https://br.shein.com/search?ici=SearchBox&scici=SearchBox&keyword=%s&min_price=%.2f&max_price=%.2f",
		url.QueryEscape(query),
		minVal,
		maxVal,
	)

	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return nil, err
	}

	// Headers to avoid basic anti-bot detection
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Referer", "https://br.shein.com/")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("shein search failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("shein returned status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse shein response: %w", err)
	}

	var results []models.CrawlResult

	// Parse product cards - Shein uses various container classes
	doc.Find("div[class*='product-item']").Each(func(_ int, sel *goquery.Selection) {
		// Product title
		title := strings.TrimSpace(sel.Find("a[class*='product-title']").Text())
		if title == "" {
			title = strings.TrimSpace(sel.Find("span[class*='product-title']").Text())
		}
		if title == "" {
			title = strings.TrimSpace(sel.Find("a").First().Text())
		}

		// Product price - Shein displays prices with R$ prefix
		priceText := strings.TrimSpace(sel.Find("span[class*='price']").First().Text())
		if priceText == "" {
			// Fallback to other price selector patterns
			priceText = strings.TrimSpace(sel.Find("div[class*='price']").First().Text())
		}

		// Clean price: remove currency symbols and parse
		priceText = strings.TrimSpace(priceText)
		priceText = strings.ReplaceAll(priceText, "R$", "")
		priceText = strings.ReplaceAll(priceText, ",", ".")
		priceText = strings.Fields(priceText)[0]

		price, err := strconv.ParseFloat(priceText, 64)
		if err != nil || price == 0 {
			return
		}

		// Check price range filter
		if price < minVal || price > maxVal {
			return
		}

		// Product link
		link, _ := sel.Find("a[class*='product-link']").Attr("href")
		if link == "" {
			link, _ = sel.Find("a").First().Attr("href")
		}
		if link != "" && !strings.HasPrefix(link, "http") {
			link = "https://br.shein.com" + link
		}

		// Product image
		img, _ := sel.Find("img[class*='product-img']").Attr("src")
		if img == "" {
			img, _ = sel.Find("img").First().Attr("src")
		}

		if title == "" || link == "" {
			return
		}

		results = append(results, models.CrawlResult{
			Title:     title,
			Price:     price,
			URL:       link,
			ImageURL:  nullableString(img),
			Source:    "shein",
			CrawledAt: time.Now(),
		})
	})

	// If no products found via standard parsing, Shein may have triggered anti-bot.
	// In production, consider escalating to Chromium-based scraping (crawl4ai) here.
	if len(results) == 0 {
		return nil, fmt.Errorf("shein: no products found (possible anti-bot block); consider using Chromium for reliability")
	}

	return results, nil
}

// init registers the sheinScraper in the global registry.
func init() {
	Register(&sheinScraper{
		client: &http.Client{Timeout: 20 * time.Second},
	})
}
