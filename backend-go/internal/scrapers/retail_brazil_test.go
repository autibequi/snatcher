package scrapers

import (
	"strings"
	"testing"
)

func TestParseBrazilRetailListing_KabumLikeHTML(t *testing.T) {
	html := `<!DOCTYPE html><html><body>
<div><a href="/produto/999/memoria">Memória DDR4 8GB</a>
<span class="price">R$ 129,90</span></div>
</body></html>`
	page := "https://www.kabum.com.br/busca?term=memoria"
	out, err := parseBrazilRetailListing(html, page, "kabum", []string{"/produto/"}, 0, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Fatalf("expected 1 result, got %d", len(out))
	}
	if !strings.Contains(out[0].URL, "/produto/") {
		t.Fatalf("url: %s", out[0].URL)
	}
	if out[0].Price != 129.90 {
		t.Fatalf("price got %v", out[0].Price)
	}
}

func TestParseBrazilRetailListing_PriceRange(t *testing.T) {
	html := `<html><body>
<div><a href="/produto/1/a">Barato</a><span class="price">R$ 10,00</span></div>
<div><a href="/produto/2/b">Caro</a><span class="price">R$ 500,00</span></div>
</body></html>`
	out, err := parseBrazilRetailListing(html, "https://x", "kabum", []string{"/produto/"}, 50, 1000, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || !strings.Contains(out[0].Title, "Caro") {
		t.Fatalf("got %+v", out)
	}
}

func TestPriceOKRetail(t *testing.T) {
	if !priceOKRetail(100, 0, 0) {
		t.Fatal("open range")
	}
	if priceOKRetail(100, 200, 0) {
		t.Fatal("below min")
	}
	if priceOKRetail(100, 0, 50) {
		t.Fatal("above max")
	}
}
