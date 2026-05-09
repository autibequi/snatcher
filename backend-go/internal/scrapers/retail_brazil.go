package scrapers

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"snatcher/backendv2/internal/models"
)

func priceOKRetail(price, minVal, maxVal float64) bool {
	if price <= 0 {
		return false
	}
	if minVal > 0 && price < minVal {
		return false
	}
	if maxVal > 0 && price > maxVal {
		return false
	}
	return true
}

func nullableRetailMeta(s string) models.NullString {
	return models.NullString{NullString: sql.NullString{String: s, Valid: s != ""}}
}

func absoluteFromBase(pageURL, href string) string {
	href = strings.TrimSpace(href)
	if href == "" || href == "#" {
		return ""
	}
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	if strings.HasPrefix(href, "//") {
		return "https:" + href
	}
	base, err := url.Parse(pageURL)
	if err != nil {
		return href
	}
	ref, err := url.Parse(href)
	if err != nil {
		return href
	}
	return base.ResolveReference(ref).String()
}

// parseBrazilRetailListing parses common Brazilian retail search HTML (Kabum, Via stack).
func parseBrazilRetailListing(html string, pageURL, source string, hrefMustContain []string, minVal, maxVal float64, limit int) ([]models.CrawlResult, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, err
	}
	var out []models.CrawlResult
	seen := map[string]bool{}

	doc.Find("a[href]").Each(func(_ int, sel *goquery.Selection) {
		if len(out) >= limit {
			return
		}
		href, _ := sel.Attr("href")
		low := strings.ToLower(href)
		ok := false
		for _, sub := range hrefMustContain {
			if strings.Contains(low, strings.ToLower(sub)) {
				ok = true
				break
			}
		}
		if !ok {
			return
		}
		abs := absoluteFromBase(pageURL, href)
		if abs == "" || seen[abs] {
			return
		}
		seen[abs] = true

		title := strings.TrimSpace(sel.Text())
		if len(title) < 4 {
			title = strings.TrimSpace(sel.Parent().Find("h2, h3, [class*='name']").First().Text())
		}
		if title == "" {
			title = "Produto"
		}

		card := sel.Closest("article, li, div")
		priceText := strings.TrimSpace(card.Find("[class*='price'], [class*='Price']").First().Text())
		priceText = strings.ReplaceAll(priceText, "R$", "")
		priceText = strings.ReplaceAll(priceText, " ", "")
		priceText = strings.ReplaceAll(priceText, "\u00a0", "")
		// Brazilian format: 1.234,56
		priceText = strings.ReplaceAll(priceText, ".", "")
		priceText = strings.ReplaceAll(priceText, ",", ".")
		price, _ := strconv.ParseFloat(priceText, 64)

		if !priceOKRetail(price, minVal, maxVal) {
			return
		}

		img, _ := card.Find("img").First().Attr("src")
		if img == "" {
			img, _ = card.Find("img").First().Attr("data-src")
		}

		out = append(out, models.CrawlResult{
			Title:     strings.TrimSpace(title),
			Price:     price,
			URL:       abs,
			ImageURL:  nullableRetailMeta(img),
			Source:    source,
			CrawledAt: time.Now(),
		})
	})

	return out, nil
}

func fetchRetailSearch(ctx context.Context, client *http.Client, pageURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http %d", resp.StatusCode)
	}
	var b strings.Builder
	_, err = b.ReadFrom(resp.Body)
	if err != nil {
		return "", err
	}
	return b.String(), nil
}

// --- Kabum -------------------------------------------------------------------

type kabumScraper struct {
	client *http.Client
}

func (s *kabumScraper) ID() string     { return "kabum" }
func (s *kabumScraper) Category() string { return "ecommerce" }

func (s *kabumScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	q := strings.TrimSpace(query)
	pageURL := "https://www.kabum.com.br/busca?term=" + url.QueryEscape(q)
	html, err := fetchRetailSearch(ctx, s.client, pageURL)
	if err != nil {
		return nil, err
	}
	return parseBrazilRetailListing(html, pageURL, "kabum", []string{"/produto/"}, minVal, maxVal, 40)
}

func init() {
	Register(&kabumScraper{client: &http.Client{Timeout: 25 * time.Second}})
}

// --- Americanas (B2W) --------------------------------------------------------

type americanasScraper struct {
	client *http.Client
}

func (s *americanasScraper) ID() string     { return "americanas" }
func (s *americanasScraper) Category() string { return "ecommerce" }

func (s *americanasScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	q := strings.TrimSpace(query)
	pageURL := "https://www.americanas.com.br/busca?terms=" + url.QueryEscape(q)
	html, err := fetchRetailSearch(ctx, s.client, pageURL)
	if err != nil {
		return nil, err
	}
	return parseBrazilRetailListing(html, pageURL, "americanas", []string{"/produto/", "/p/"}, minVal, maxVal, 40)
}

func init() {
	Register(&americanasScraper{client: &http.Client{Timeout: 25 * time.Second}})
}

// --- Casas Bahia -------------------------------------------------------------

type casasBahiaScraper struct {
	client *http.Client
}

func (s *casasBahiaScraper) ID() string     { return "casasbahia" }
func (s *casasBahiaScraper) Category() string { return "ecommerce" }

func (s *casasBahiaScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	q := strings.TrimSpace(query)
	pageURL := "https://www.casasbahia.com.br/busca?terms=" + url.QueryEscape(q)
	html, err := fetchRetailSearch(ctx, s.client, pageURL)
	if err != nil {
		return nil, err
	}
	return parseBrazilRetailListing(html, pageURL, "casasbahia", []string{"/produto/", "/p/"}, minVal, maxVal, 40)
}

func init() {
	Register(&casasBahiaScraper{client: &http.Client{Timeout: 25 * time.Second}})
}
