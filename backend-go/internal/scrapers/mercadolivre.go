package scrapers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
)

const mlBaseURL = "https://lista.mercadolivre.com.br"

// mercadoLivreScraper implements the Scraper interface for Mercado Livre marketplace.
type mercadoLivreScraper struct {
	client       *http.Client
	clientID     string
	clientSecret string
	tokenMu      sync.Mutex
	token        string
	tokenExpiry  time.Time
}

// NewMLScraper creates a new Mercado Livre scraper (legacy constructor, kept for compatibility).
type MLScraper struct {
	client       *http.Client
	clientID     string
	clientSecret string
	tokenMu      sync.Mutex
	token        string
	tokenExpiry  time.Time
}

func NewMLScraper(clientID, clientSecret string) *MLScraper {
	return &MLScraper{
		client:       &http.Client{Timeout: 20 * time.Second},
		clientID:     clientID,
		clientSecret: clientSecret,
	}
}

func (s *MLScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	if s.clientID != "" && s.clientSecret != "" {
		items, err := s.searchAPI(ctx, query, minVal, maxVal)
		if err == nil {
			return items, nil
		}
	}
	return s.searchHTML(ctx, query, minVal, maxVal)
}

func (s *MLScraper) Provider() string { return "mercadolivre" }

// extractMercadoLivreID extrai MLB ID da URL
func extractMercadoLivreID(rawURL string) string {
	re := regexp.MustCompile(`MLB-?\d+`)
	if m := re.FindString(rawURL); m != "" {
		return strings.ReplaceAll(m, "-", "") // normaliza removendo dash
	}
	return ""
}

type mlSearchAttr struct {
	ID        string `json:"id"`
	ValueName string `json:"value_name"`
}

// Ordem preferida para montar uma linha de specs na listagem (API search).
var mlSpecAttrPriority = []string{
	"MODEL", "LINE", "RAM_MEMORY", "INTERNAL_STORAGE_CAPACITY",
	"STORAGE_CAPACITY", "COLOR", "DISPLAY_SIZE", "WEIGHT", "PROCESSOR_MODEL",
}

func mlMetadataFromAttrs(attrs []mlSearchAttr) models.CrawlMetadata {
	if len(attrs) == 0 {
		return models.CrawlMetadata{}
	}
	var brand string
	byID := make(map[string]string)
	for _, a := range attrs {
		if a.ValueName == "" {
			continue
		}
		if a.ID == "BRAND" {
			brand = a.ValueName
			continue
		}
		byID[a.ID] = a.ValueName
	}
	var parts []string
	seen := make(map[string]bool)
	for _, id := range mlSpecAttrPriority {
		v, ok := byID[id]
		if !ok || seen[v] {
			continue
		}
		parts = append(parts, v)
		seen[v] = true
		if len(parts) >= 4 {
			break
		}
	}
	if len(parts) < 4 {
		for _, a := range attrs {
			if a.ID == "BRAND" || a.ValueName == "" || seen[a.ValueName] {
				continue
			}
			parts = append(parts, a.ValueName)
			seen[a.ValueName] = true
			if len(parts) >= 4 {
				break
			}
		}
	}
	specs := strings.Join(parts, " · ")
	desc := specs
	switch {
	case brand != "" && specs != "":
		desc = brand + " · " + specs
	case brand != "":
		desc = brand
	}
	if brand == "" && specs == "" && desc == "" {
		return models.CrawlMetadata{}
	}
	return models.CrawlMetadata{
		Brand:        brand,
		SpecsSummary: specs,
		Description:  desc,
	}
}

// searchAPI usa a API oficial do ML com OAuth2 client_credentials.
func (s *MLScraper) searchAPI(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	token, err := s.getToken(ctx)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"https://api.mercadolibre.com/sites/MLB/search?q=%s&price=%g-%g&limit=20",
		url.QueryEscape(query), minVal, maxVal,
	)
	req, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("ml api status %d", resp.StatusCode)
	}

	var body struct {
		Results []struct {
			Title       string         `json:"title"`
			Price       float64        `json:"price"`
			Permalink   string         `json:"permalink"`
			Thumbnail   string         `json:"thumbnail"`
			Attributes  []mlSearchAttr `json:"attributes"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}

	out := make([]pipeline.Item, 0, len(body.Results))
	for _, row := range body.Results {
		if row.Price < minVal || row.Price > maxVal {
			continue
		}
		meta := mlMetadataFromAttrs(row.Attributes)
		out = append(out, pipeline.Item{
			Title:       row.Title,
			Price:       row.Price,
			URL:         row.Permalink,
			ImageURL:    row.Thumbnail,
			Source:      "mercadolivre",
			SourceSubID: extractMercadoLivreID(row.Permalink),
			Metadata:    crawlMetaBytes(meta),
		})
	}
	return out, nil
}

func (s *MLScraper) getToken(ctx context.Context) (string, error) {
	s.tokenMu.Lock()
	defer s.tokenMu.Unlock()
	if time.Now().Before(s.tokenExpiry) && s.token != "" {
		return s.token, nil
	}

	body := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {s.clientID},
		"client_secret": {s.clientSecret},
	}
	req, _ := http.NewRequestWithContext(ctx, "POST",
		"https://api.mercadolibre.com/oauth/token",
		strings.NewReader(body.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", err
	}
	s.token = tok.AccessToken
	s.tokenExpiry = time.Now().Add(time.Duration(tok.ExpiresIn-60) * time.Second)
	return s.token, nil
}

// searchHTML usa scraping da página de listagem como fallback.
func (s *MLScraper) searchHTML(ctx context.Context, query string, minVal, maxVal float64) ([]pipeline.Item, error) {
	searchURL := fmt.Sprintf("%s/%s", mlBaseURL, url.PathEscape(query))
	req, _ := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("ml html status %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var items []pipeline.Item
	doc.Find(".ui-search-result__wrapper").Each(func(_ int, sel *goquery.Selection) {
		title := strings.TrimSpace(sel.Find(".ui-search-item__title").Text())
		priceText := strings.TrimSpace(sel.Find(".andes-money-amount__fraction").First().Text())
		priceText = strings.ReplaceAll(priceText, ".", "")
		priceText = strings.ReplaceAll(priceText, ",", ".")
		price, _ := strconv.ParseFloat(priceText, 64)
		link, _ := sel.Find("a.ui-search-link").First().Attr("href")
		img, _ := sel.Find("img.ui-search-result-image__element").First().Attr("data-src")
		if img == "" {
			img, _ = sel.Find("img.ui-search-result-image__element").First().Attr("src")
		}

		if title == "" || price == 0 || link == "" {
			return
		}
		if price < minVal || price > maxVal {
			return
		}
		// Limpa parâmetros de tracking do link
		if u, err := url.Parse(link); err == nil {
			u.RawQuery = ""
			link = u.String()
		}
		subtitle := strings.TrimSpace(sel.Find(".poly-component__subtitle").First().Text())
		if subtitle == "" {
			subtitle = strings.TrimSpace(sel.Find(".ui-search-item__subtitle").First().Text())
		}
		var metaBytes []byte
		if subtitle != "" {
			if len(subtitle) > 400 {
				subtitle = subtitle[:400]
			}
			metaBytes = crawlMetaBytes(models.CrawlMetadata{Description: subtitle})
		}
		items = append(items, pipeline.Item{
			Title:       title,
			Price:       price,
			URL:         link,
			ImageURL:    img,
			Source:      "mercadolivre",
			SourceSubID: extractMercadoLivreID(link),
			Metadata:    metaBytes,
		})
	})
	return items, nil
}

// readAll é helper para leitura de body (não usado mas mantido para referência)
func readAll(r io.Reader) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r, 2<<20))
}

// Plugin interface implementations for mercadoLivreScraper
// ========================================================

// ID returns the unique identifier for this scraper.
func (s *mercadoLivreScraper) ID() string {
	return "ml"
}

// Category returns the source category.
func (s *mercadoLivreScraper) Category() string {
	return "ecommerce"
}

// Search implements the Scraper interface, returning models.CrawlResult.
// It delegates to the legacy pipeline-based search logic.
func (s *mercadoLivreScraper) Search(ctx context.Context, query string, minVal, maxVal float64) ([]models.CrawlResult, error) {
	// Use a fresh MLScraper instance for each search (sync.Mutex cannot be copied)
	legacyScraper := NewMLScraper(s.clientID, s.clientSecret)

	items, err := legacyScraper.Search(ctx, query, minVal, maxVal)
	if err != nil {
		return nil, err
	}

	// Convert pipeline.Item to models.CrawlResult
	results := make([]models.CrawlResult, len(items))
	for i, item := range items {
		meta := item.Metadata
		if len(meta) == 0 {
			meta = []byte("{}")
		}
		results[i] = models.CrawlResult{
			Title:       item.Title,
			Price:       item.Price,
			URL:         item.URL,
			ImageURL:    nullableString(item.ImageURL),
			Source:      item.Source,
			SourceSubID: nullableString(item.SourceSubID),
			CrawledAt:   time.Now(),
			Metadata:    meta,
		}
	}
	return results, nil
}

// nullableString converts a string to a models.NullString.
func nullableString(s string) models.NullString {
	return models.NullString{
		NullString: sql.NullString{String: s, Valid: s != ""},
	}
}

// init registers the mercadoLivreScraper in the global registry.
func init() {
	// Empty clientID/clientSecret will trigger HTML fallback in the legacy scraper.
	Register(&mercadoLivreScraper{
		client:       &http.Client{Timeout: 20 * time.Second},
		clientID:     "", // Will be populated from AppConfig at runtime
		clientSecret: "",
	})
}
