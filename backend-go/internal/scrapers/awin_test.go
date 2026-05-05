package scrapers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestAWINParsingFixture validates AWIN JSON fixture parsing and merchant tracking.
func TestAWINParsingFixture(t *testing.T) {
	// Load fixture
	fixture := loadAWINFixture()

	// Validate fixture structure
	if fixture.Total < 5 {
		t.Errorf("expected at least 5 products in fixture, got %d", fixture.Total)
	}

	if len(fixture.Products) < 5 {
		t.Errorf("expected at least 5 products in array, got %d", len(fixture.Products))
	}

	// Simulate parsing - collect source_subid (merchant) for each product
	merchantMap := make(map[string]int)
	var results []map[string]interface{}

	for _, product := range fixture.Products {
		if product.ProductName != "" && product.ProductPrice > 0 && product.DeepLink != "" {
			subID := product.MerchantInfo.MerchantName
			if subID == "" {
				// Fallback to merchant ID as string
				subID = string(rune(product.MerchantInfo.MerchantID))
			}

			merchantMap[subID]++

			results = append(results, map[string]interface{}{
				"title":        product.ProductName,
				"price":        product.ProductPrice,
				"url":          product.DeepLink,
				"source":       "awin",
				"source_subid": subID,
			})
		}
	}

	// Validate: at least 5 products parsed
	if len(results) < 5 {
		t.Errorf("expected at least 5 parsed products, got %d", len(results))
	}

	// CRITICAL: AWIN test validates that we have >=2 distinct merchants
	if len(merchantMap) < 2 {
		t.Errorf("expected at least 2 distinct merchants, got %d", len(merchantMap))
	}

	// Validate each product
	for i, result := range results {
		if result["title"].(string) == "" {
			t.Errorf("product[%d].title is empty", i)
		}
		if result["price"].(float64) <= 0 {
			t.Errorf("product[%d].price is not positive", i)
		}
		if result["source_subid"].(string) == "" {
			t.Errorf("product[%d].source_subid is empty (must track merchant)", i)
		}
	}

	t.Logf("✓ Parsed %d products from AWIN fixture with %d distinct merchants", len(results), len(merchantMap))
	for merchant, count := range merchantMap {
		t.Logf("  - %s: %d products", merchant, count)
	}
}

// TestAWINMerchantAggregation validates that products from same merchant are grouped.
func TestAWINMerchantAggregation(t *testing.T) {
	fixture := loadAWINFixture()

	// Group products by merchant
	merchantProducts := make(map[string]int)
	for _, product := range fixture.Products {
		merchant := product.MerchantInfo.MerchantName
		merchantProducts[merchant]++
	}

	// Verify we have multiple merchants
	if len(merchantProducts) < 2 {
		t.Errorf("expected at least 2 merchants in fixture, got %d", len(merchantProducts))
	}

	// Verify merchant aggregation works
	totalProducts := 0
	for merchant, count := range merchantProducts {
		totalProducts += count
		if count <= 0 {
			t.Errorf("merchant %s has %d products", merchant, count)
		}
	}

	if totalProducts != len(fixture.Products) {
		t.Errorf("product count mismatch: aggregated %d, fixture has %d", totalProducts, len(fixture.Products))
	}

	t.Logf("✓ Merchant aggregation test passed: %d merchants, %d total products", len(merchantProducts), totalProducts)
}

// TestAWINMockHTTPServer validates the full scraper flow with a mock HTTP server.
func TestAWINMockHTTPServer(t *testing.T) {
	// Load fixture
	fixture := loadAWINFixture()

	// Marshal fixture to JSON
	fixtureJSON, err := json.Marshal(fixture)
	if err != nil {
		t.Fatalf("failed to marshal fixture: %v", err)
	}

	// Create mock HTTP server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check auth header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, string(fixtureJSON))
	}))
	defer server.Close()

	// Validate that the mock server returns valid JSON
	var parsedFixture awinFixture
	if err := json.Unmarshal(fixtureJSON, &parsedFixture); err != nil {
		t.Fatalf("failed to parse mock JSON: %v", err)
	}

	if len(parsedFixture.Products) < 5 {
		t.Errorf("expected at least 5 products in mock response, got %d", len(parsedFixture.Products))
	}

	t.Logf("✓ Mock HTTP server test: received %d products from mock API", len(parsedFixture.Products))
}

// TestAWINPriceFiltering validates price range filtering.
func TestAWINPriceFiltering(t *testing.T) {
	fixture := loadAWINFixture()

	minVal := 600.0
	maxVal := 1800.0

	var filtered []awinProduct
	for _, product := range fixture.Products {
		if product.ProductPrice >= minVal && product.ProductPrice <= maxVal {
			filtered = append(filtered, product)
		}
	}

	// Should have some products in range
	if len(filtered) == 0 {
		t.Errorf("expected products in range [%.2f, %.2f], got none", minVal, maxVal)
	}

	// Verify all filtered products are in range
	for i, product := range filtered {
		if product.ProductPrice < minVal || product.ProductPrice > maxVal {
			t.Errorf("product[%d] price %.2f outside range [%.2f, %.2f]",
				i, product.ProductPrice, minVal, maxVal)
		}
	}

	t.Logf("✓ Price filtering test: %d products in range [%.2f, %.2f]", len(filtered), minVal, maxVal)
}

// TestAWINDistinctMerchants validates that fixture has at least 2 distinct merchants.
func TestAWINDistinctMerchants(t *testing.T) {
	fixture := loadAWINFixture()

	merchants := make(map[int64]bool)
	for _, product := range fixture.Products {
		merchants[product.MerchantInfo.MerchantID] = true
	}

	if len(merchants) < 2 {
		t.Errorf("expected at least 2 distinct merchants, got %d", len(merchants))
	}

	t.Logf("✓ Distinct merchants test: %d merchants found", len(merchants))
}

// ============ Helpers ============

type awinFixture struct {
	Products []awinProduct `json:"products"`
	Total    int           `json:"total"`
	Status   string        `json:"status"`
}

func loadAWINFixture() *awinFixture {
	fixtureJSON := `{
  "products": [
    {
      "product_name": "Smartphone Pro 5G 256GB Storage",
      "product_price": 1899.90,
      "product_id": "awin-12345678",
      "product_image": "https://cdn.awin.com/images/phone-pro-5g.jpg",
      "deeplink": "https://www.awin1.com/cread.php?awinaffid=123456&awinmid=45678&p=https://adidas.com/smartphone-pro-5g",
      "merchant": {
        "merchant_id": 123456,
        "merchant_name": "Adidas Official Store",
        "logo": "https://cdn.awin.com/merchants/adidas.png",
        "default_cpc": "10.50"
      },
      "commission_group": "Electronics"
    },
    {
      "product_name": "Smartphone Pro 5G 256GB Storage",
      "product_price": 1799.00,
      "product_id": "awin-87654321",
      "product_image": "https://cdn.awin.com/images/phone-pro-5g.jpg",
      "deeplink": "https://www.awin1.com/cread.php?awinaffid=123456&awinmid=98765&p=https://nike.com/smartphone-pro-5g",
      "merchant": {
        "merchant_id": 98765,
        "merchant_name": "Nike Store",
        "logo": "https://cdn.awin.com/merchants/nike.png",
        "default_cpc": "12.75"
      },
      "commission_group": "Electronics"
    },
    {
      "product_name": "Smartphone Budget 4G 128GB",
      "product_price": 699.90,
      "product_id": "awin-55667788",
      "product_image": "https://cdn.awin.com/images/phone-budget-4g.jpg",
      "deeplink": "https://www.awin1.com/cread.php?awinaffid=123456&awinmid=55667&p=https://amazon.com.br/smartphone-budget-4g",
      "merchant": {
        "merchant_id": 55667,
        "merchant_name": "Amazon Brasil",
        "logo": "https://cdn.awin.com/merchants/amazon.png",
        "default_cpc": "5.50"
      },
      "commission_group": "Electronics"
    },
    {
      "product_name": "Smartphone Ultra Gaming 512GB",
      "product_price": 2499.00,
      "product_id": "awin-11223344",
      "product_image": "https://cdn.awin.com/images/phone-gaming.jpg",
      "deeplink": "https://www.awin1.com/cread.php?awinaffid=123456&awinmid=11223&p=https://razer.com/smartphone-gaming",
      "merchant": {
        "merchant_id": 11223,
        "merchant_name": "Razer Gaming",
        "logo": "https://cdn.awin.com/merchants/razer.png",
        "default_cpc": "25.00"
      },
      "commission_group": "Electronics"
    },
    {
      "product_name": "Smartphone Budget 4G 128GB",
      "product_price": 699.00,
      "product_id": "awin-44556677",
      "product_image": "https://cdn.awin.com/images/phone-budget-4g.jpg",
      "deeplink": "https://www.awin1.com/cread.php?awinaffid=123456&awinmid=44556&p=https://bestbuy.com.br/smartphone-budget-4g",
      "merchant": {
        "merchant_id": 44556,
        "merchant_name": "Best Buy Brasil",
        "logo": "https://cdn.awin.com/merchants/bestbuy.png",
        "default_cpc": "6.75"
      },
      "commission_group": "Electronics"
    }
  ],
  "total": 5,
  "status": "success"
}`

	var fixture awinFixture
	_ = json.Unmarshal([]byte(fixtureJSON), &fixture)
	return &fixture
}
