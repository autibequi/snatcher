package scrapers

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"snatcher/backendv2/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const magaluBaseURL = "https://www.magazineluiza.com.br"

// magaluScraper implements the Scraper interface for Magazine Luiza marketplace.
type magaluScraper struct {
	client *http.Client
}

// ID returns the unique identifier for this scraper.
func (s *magaluScraper) ID() string {
	return "magalu"
}

// Category returns the source category.
func (s *magaluScraper) Category() string {
	return "ecommerce"
}

// Search implements the Scraper interface, returning models.CrawlResult.
// It uses HTML scraping to extract products from Magazine Luiza search results.
func (s *magaluScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	return s.searchHTML(ctx, query, minVal, maxVal)
}

// searchHTML scrapes Magazine Luiza listing page via goquery.
func (s *magaluScraper) searchHTML(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	searchURL := fmt.Sprintf("%s/busca/%s", magaluBaseURL, url.QueryEscape(query))

	req, _ := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("magalu html status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var results []models.CrawlResult

	// Magazine Luiza product card selector (typical structure)
	// Adjust selectors based on actual HTML structure
	doc.Find("[class*='product-card'], [data-testid*='product']").Each(func(_ int, sel *goquery.Selection) {
		// Extract title
		title := strings.TrimSpace(sel.Find("h2").First().Text())
		if title == "" {
			title = strings.TrimSpace(sel.Find("a[aria-label]").First().AttrOr("aria-label", ""))
		}
		if title == "" {
			title = strings.TrimSpace(sel.Find("[class*='product-name']").First().Text())
		}

		// Extract price
		// Magazine Luiza typically shows price in multiple formats
		priceText := strings.TrimSpace(sel.Find("[class*='price']").First().Text())
		if priceText == "" {
			priceText = strings.TrimSpace(sel.Find("span[class*='valor']").First().Text())
		}
		// Clean price string
		priceText = strings.ReplaceAll(priceText, "R$", "")
		priceText = strings.ReplaceAll(priceText, " ", "")
		priceText = strings.ReplaceAll(priceText, ".", "")
		priceText = strings.ReplaceAll(priceText, ",", ".")
		price, _ := strconv.ParseFloat(priceText, 64)

		// Extract product URL
		link, _ := sel.Find("a").First().Attr("href")
		if link != "" {
			if !strings.HasPrefix(link, "http") {
				link = magaluBaseURL + link
			}
			// Parse URL to add partner_id if needed
			// TODO: refine partner_id template for Magalu Afiliados
		}

		// Extract image URL
		img, _ := sel.Find("img").First().Attr("src")
		if img == "" {
			img, _ = sel.Find("img").First().Attr("data-src")
		}

		// Validate and filter by price range
		if title == "" || price == 0 || link == "" {
			return
		}
		if price < minVal || price > maxVal {
			return
		}

		results = append(results, models.CrawlResult{
			Title:     title,
			Price:     price,
			URL:       link,
			ImageURL:  nullableStringMagalu(img),
			Source:    "magalu",
			CrawledAt: time.Now(),
		})
	})

	return results, nil
}

// nullableString converts a string to a models.NullString.
func nullableStringMagalu(s string) models.NullString {
	return models.NullString{
		NullString: sql.NullString{String: s, Valid: s != ""},
	}
}

// init registers the magaluScraper in the global registry.
func init() {
	Register(&magaluScraper{
		client: &http.Client{Timeout: 20 * time.Second},
	})
}
