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

// kinguinScraper implements the Scraper interface for Kinguin marketplace.
// Kinguin is a marketplace for digital game keys and software licenses.
type kinguinScraper struct {
	client *http.Client
}

// ID returns the unique identifier for this scraper.
func (s *kinguinScraper) ID() string {
	return "kinguin"
}

// Category returns the source category.
func (s *kinguinScraper) Category() string {
	return "cdkey"
}

// Search implements the Scraper interface.
// It performs HTML scraping of Kinguin's product listing pages.
func (s *kinguinScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// Kinguin search URL
	searchURL := fmt.Sprintf(
		"https://www.kinguin.net/search?q=%s",
		url.QueryEscape(query),
	)

	req, _ := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("kinguin status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var results []models.CrawlResult

	// Kinguin product cards are typically in divs with class "product-item" or similar
	// Selector may need adjustment based on actual Kinguin HTML structure
	doc.Find("div[class*='product']").Each(func(_ int, sel *goquery.Selection) {
		// Extract product title/name
		title := strings.TrimSpace(sel.Find("a[class*='name'], h2, span[class*='title']").First().Text())
		if title == "" {
			title = strings.TrimSpace(sel.Find("a").First().Text())
		}

		// Extract price — look for common price indicators
		priceText := strings.TrimSpace(sel.Find("span[class*='price'], div[class*='price']").First().Text())
		// Clean price: remove currency symbols and whitespace
		cleanPrice := ""
		for _, r := range priceText {
			if (r >= '0' && r <= '9') || r == '.' || r == ',' {
				cleanPrice += string(r)
			}
		}
		cleanPrice = strings.ReplaceAll(cleanPrice, ",", ".")
		price, _ := strconv.ParseFloat(cleanPrice, 64)

		// Extract product URL
		link, _ := sel.Find("a").First().Attr("href")
		if link != "" && !strings.HasPrefix(link, "http") {
			link = "https://www.kinguin.net" + link
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

		// Add affiliate parameter if applicable
		// Kinguin Affiliate Program: use referral code in URL
		if !strings.Contains(link, "?") {
			link = link + "?affiliate=snatcher"
		} else {
			link = link + "&affiliate=snatcher"
		}

		results = append(results, models.CrawlResult{
			Title:     title,
			Price:     price,
			URL:       link,
			ImageURL:  nullableString(img),
			Source:    "kinguin",
			CrawledAt: time.Now(),
		})
	})

	return results, nil
}

// init registers the kinguinScraper in the global registry.
func init() {
	Register(&kinguinScraper{
		client: &http.Client{Timeout: 20 * time.Second},
	})
}
