package scrapers

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"

	"snatcher/backendv2/internal/models"
)

// TestParseAmazonSearchResults_CapturaPrecoDe garante que o preço "de" (lista/riscado,
// .a-text-price) é extraído em OriginalPrice — a peça que faltava pra detectar desconto.
func TestParseAmazonSearchResults_CapturaPrecoDe(t *testing.T) {
	html := `<div data-component-type="s-search-result" data-asin="B0TEST123">
		<h2><span>Whey Protein Concentrado 1kg</span></h2>
		<span class="a-price"><span class="a-price-whole">99</span><span class="a-price-fraction">90</span></span>
		<span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$ 149,90</span></span>
		<span class="a-text-price"><span class="a-offscreen">R$ 8,32</span></span>
		<img class="s-image" src="https://x/img.jpg"/>
	</div>`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		t.Fatalf("parse html: %v", err)
	}
	items := parseAmazonSearchResults(doc, 0, 100000)
	if len(items) != 1 {
		t.Fatalf("esperava 1 item, got %d", len(items))
	}
	if items[0].Price != 99.90 {
		t.Errorf("preço atual: esperava 99.90, got %v", items[0].Price)
	}
	var m models.CrawlMetadata
	if err := json.Unmarshal(items[0].Metadata, &m); err != nil {
		t.Fatalf("metadata json: %v", err)
	}
	if m.OriginalPrice != 149.90 {
		t.Errorf("OriginalPrice (preço de): esperava 149.90, got %v", m.OriginalPrice)
	}
}

// TestParseAmazonSearchResults_SemPrecoDe: sem .a-text-price, OriginalPrice fica 0
// (produto sem desconto — só vira send_ready se for achadinho barato).
func TestParseAmazonSearchResults_SemPrecoDe(t *testing.T) {
	html := `<div data-component-type="s-search-result" data-asin="B0XXX">
		<h2><span>Mouse RGB Wireless</span></h2>
		<span class="a-price"><span class="a-price-whole">15</span><span class="a-price-fraction">90</span></span>
		<img class="s-image" src="https://x/m.jpg"/>
	</div>`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		t.Fatalf("parse html: %v", err)
	}
	items := parseAmazonSearchResults(doc, 0, 100000)
	if len(items) != 1 {
		t.Fatalf("esperava 1 item, got %d", len(items))
	}
	var m models.CrawlMetadata
	_ = json.Unmarshal(items[0].Metadata, &m) // Metadata pode ser nil → m zero-valued
	if m.OriginalPrice != 0 {
		t.Errorf("sem preço de → OriginalPrice 0, got %v", m.OriginalPrice)
	}
}

// TestParseAmazonSearchResults_PrecoDeIgualOuMenorIgnorado: "de" <= atual é ruído → 0.
func TestParseAmazonSearchResults_PrecoDeIgualOuMenorIgnorado(t *testing.T) {
	html := `<div data-component-type="s-search-result" data-asin="B0YYY">
		<h2><span>Produto X</span></h2>
		<span class="a-price"><span class="a-price-whole">100</span><span class="a-price-fraction">00</span></span>
		<span class="a-price a-text-price"><span class="a-offscreen">R$ 100,00</span></span>
		<img class="s-image" src="https://x/y.jpg"/>
	</div>`
	doc, _ := goquery.NewDocumentFromReader(strings.NewReader(html))
	items := parseAmazonSearchResults(doc, 0, 100000)
	if len(items) != 1 {
		t.Fatalf("esperava 1 item, got %d", len(items))
	}
	var m models.CrawlMetadata
	_ = json.Unmarshal(items[0].Metadata, &m)
	if m.OriginalPrice != 0 {
		t.Errorf("preço de == atual deve ser ignorado (0), got %v", m.OriginalPrice)
	}
}
