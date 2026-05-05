package scrapers

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

var amzUserAgents = []string{
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
}

// amazonScraper implements the Scraper interface for Amazon marketplace.
type amazonScraper struct {
	client  *http.Client
	uaIndex int
}

// AmazonScraper is the legacy struct kept for compatibility.
type AmazonScraper struct {
	client    *http.Client
	uaIndex   int
}

func NewAmazonScraper() *AmazonScraper {
	return &AmazonScraper{
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

func (s *AmazonScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	searchURL := fmt.Sprintf(
		"https://www.amazon.com.br/s?k=%s&i=aps&rh=p_36%%3A%d00-%d00",
		url.QueryEscape(query),
		int(minVal),
		int(maxVal),
	)

	req, _ := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	ua := amzUserAgents[s.uaIndex%len(amzUserAgents)]
	s.uaIndex++
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("amazon status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var items []pipeline.Item
	doc.Find("[data-component-type='s-search-result']").Each(func(_ int, sel *goquery.Selection) {
		title := strings.TrimSpace(sel.Find("h2 span").First().Text())
		if title == "" {
			title = strings.TrimSpace(sel.Find(".a-text-normal").First().Text())
		}

		// Preço: tenta inteiro + fração
		priceWhole := strings.TrimSpace(sel.Find(".a-price-whole").First().Text())
		priceFrac := strings.TrimSpace(sel.Find(".a-price-fraction").First().Text())
		priceWhole = strings.ReplaceAll(priceWhole, ".", "")
		priceWhole = strings.ReplaceAll(priceWhole, ",", "")
		priceStr := priceWhole
		if priceFrac != "" {
			priceStr = priceWhole + "." + priceFrac
		}
		price, _ := strconv.ParseFloat(priceStr, 64)

		asin, _ := sel.Attr("data-asin")
		link := ""
		if asin != "" {
			link = "https://www.amazon.com.br/dp/" + asin
		} else {
			href, _ := sel.Find("a.a-link-normal").First().Attr("href")
			if href != "" && strings.HasPrefix(href, "/") {
				link = "https://www.amazon.com.br" + href
			}
		}

		img, _ := sel.Find("img.s-image").First().Attr("src")

		if title == "" || price == 0 || link == "" {
			return
		}
		if price < minVal || price > maxVal {
			return
		}
		items = append(items, pipeline.Item{
			Title:    title,
			Price:    price,
			URL:      link,
			ImageURL: img,
			Source:   "amazon",
		})
	})
	return items, nil
}

func (s *AmazonScraper) Provider() string { return "amazon" }

// Plugin interface implementations for amazonScraper
// ===================================================

// ID returns the unique identifier for this scraper.
func (s *amazonScraper) ID() string {
	return "amz"
}

// Category returns the source category.
func (s *amazonScraper) Category() string {
	return "ecommerce"
}

// Search implements the Scraper interface, returning models.CrawlResult.
// It delegates to the legacy pipeline-based search logic.
func (s *amazonScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	legacyScraper := NewAmazonScraper()
	items, err := legacyScraper.Search(ctx, query, minVal, maxVal)
	if err != nil {
		return nil, err
	}

	// Convert pipeline.Item to models.CrawlResult
	results := make([]models.CrawlResult, len(items))
	for i, item := range items {
		results[i] = models.CrawlResult{
			Title:     item.Title,
			Price:     item.Price,
			URL:       item.URL,
			ImageURL:  nullableString(item.ImageURL),
			Source:    item.Source,
			CrawledAt: time.Now(),
		}
	}
	return results, nil
}

// init registers the amazonScraper in the global registry.
func init() {
	Register(&amazonScraper{
		client:  &http.Client{Timeout: 20 * time.Second},
		uaIndex: 0,
	})
}
