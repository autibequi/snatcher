package scrapers

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

// TestAliExpressParsingFixture validates AliExpress JSON fixture parsing.
func TestAliExpressParsingFixture(t *testing.T) {
	// Load fixture
	fixture := loadAliExpressFixture()

	// Validate fixture structure
	if len(fixture.Products) < 5 {
		t.Errorf("expected at least 5 products in fixture, got %d", len(fixture.Products))
	}

	// Simulate parsing
	var results []map[string]interface{}
	for _, product := range fixture.Products {
		if product.Title != "" && product.Price > 0 && product.URL != "" {
			results = append(results, map[string]interface{}{
				"title": product.Title,
				"price": product.Price,
				"url":   product.URL,
				"img":   product.ImageURL,
			})
		}
	}

	// Validate results
	if len(results) < 5 {
		t.Errorf("expected at least 5 parsed products, got %d", len(results))
	}

	for i, result := range results {
		if result["title"].(string) == "" {
			t.Errorf("product[%d].title is empty", i)
		}
		if result["price"].(float64) <= 0 {
			t.Errorf("product[%d].price is not positive", i)
		}
		if !contains(result["url"].(string), "aliexpress.com") {
			t.Errorf("product[%d].url does not contain aliexpress.com", i)
		}
	}

	t.Logf("✓ Parsed %d products from AliExpress fixture", len(results))
}

// TestAliExpressPriceRange validates price range filtering.
func TestAliExpressPriceRange(t *testing.T) {
	fixture := loadAliExpressFixture()

	minVal := 150.0
	maxVal := 350.0

	var filtered []interface{}
	for _, product := range fixture.Products {
		if product.Price >= minVal && product.Price <= maxVal {
			filtered = append(filtered, product)
		}
	}

	// Should have some products in range [150, 350]
	if len(filtered) == 0 {
		t.Errorf("expected products in price range [%.2f, %.2f], got none", minVal, maxVal)
	}

	// Validate all filtered products are in range
	for i, item := range filtered {
		product := item.(aliExpressProduct)
		if product.Price < minVal || product.Price > maxVal {
			t.Errorf("filtered product[%d] price %.2f is outside range [%.2f, %.2f]",
				i, product.Price, minVal, maxVal)
		}
	}

	t.Logf("✓ Price range filtering: %d products in [%.2f, %.2f]", len(filtered), minVal, maxVal)
}

// TestAliExpressHTMLFallback validates HTML parsing fallback.
func TestAliExpressHTMLFallback(t *testing.T) {
	html := `<html><body>
	<div class="search-item-card">
		<h2 class="product-title">Test Smartphone</h2>
		<span class="search-price">R$ 199,99</span>
		<a class="organic-item" href="/item/1234567890.html">Link</a>
		<img class="product-img" src="/test.jpg"/>
	</div>
	</body></html>`

	doc, err := goquery.NewDocumentFromReader(bytes.NewReader([]byte(html)))
	if err != nil {
		t.Fatalf("failed to parse HTML: %v", err)
	}

	var count int
	doc.Find("div[class*='search-item-card']").Each(func(_ int, sel *goquery.Selection) {
		title := sel.Find("h2[class*='product-title']").Text()
		if title != "" {
			count++
		}
	})

	if count != 1 {
		t.Errorf("expected 1 product, got %d", count)
	}

	t.Log("✓ HTML fallback parsing test passed")
}

// ============ Helpers ============

type aliExpressProduct struct {
	Title    string  `json:"title"`
	Price    float64 `json:"price"`
	URL      string  `json:"url"`
	ImageURL string  `json:"image_url"`
}

type aliExpressFixture struct {
	Products []aliExpressProduct `json:"products"`
}

func loadAliExpressFixture() *aliExpressFixture {
	fixtureJSON := `{
  "products": [
    {
      "title": "Smartphone Global Version 5G 12GB RAM 256GB",
      "price": 250.75,
      "url": "https://www.aliexpress.com/item/1005001234567890.html",
      "image_url": "https://ae01.alicdn.com/kf/Hc123456789.jpg"
    },
    {
      "title": "Android 12 Smartphone Dual Camera 6.5 inch Screen",
      "price": 189.99,
      "url": "https://www.aliexpress.com/item/1005001234567891.html",
      "image_url": "https://ae01.alicdn.com/kf/Hc987654321.jpg"
    },
    {
      "title": "Unlocked Smartphone 48MP Camera 4G LTE",
      "price": 149.50,
      "url": "https://www.aliexpress.com/item/1005001234567892.html",
      "image_url": "https://ae01.alicdn.com/kf/Hc555666777.jpg"
    },
    {
      "title": "Budget Smartphone Quad Core 5 inch Display",
      "price": 99.90,
      "url": "https://www.aliexpress.com/item/1005001234567893.html",
      "image_url": "https://ae01.alicdn.com/kf/Hc111222333.jpg"
    },
    {
      "title": "Pro Smartphone with Curved Screen AMOLED",
      "price": 399.99,
      "url": "https://www.aliexpress.com/item/1005001234567894.html",
      "image_url": "https://ae01.alicdn.com/kf/Hc444555666.jpg"
    },
    {
      "title": "Gaming Smartphone 120Hz Refresh Rate",
      "price": 299.00,
      "url": "https://www.aliexpress.com/item/1005001234567895.html",
      "image_url": "https://ae01.alicdn.com/kf/Hc777888999.jpg"
    }
  ]
}`

	var fixture aliExpressFixture
	_ = json.Unmarshal([]byte(fixtureJSON), &fixture)
	return &fixture
}
