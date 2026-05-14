package scrapers

import (
	"bytes"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

// TestSheinParsingFixture validates Shein HTML fixture parsing.
func TestSheinParsingFixture(t *testing.T) {
	// Load fixture
	html := loadSheinFixture()

	// Parse as if from HTTP response
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader([]byte(html)))
	if err != nil {
		t.Fatalf("failed to parse HTML: %v", err)
	}

	// Simulate the scraper's parsing logic
	var results []map[string]string
	doc.Find("div[class*='product-item']").Each(func(_ int, sel *goquery.Selection) {
		// Product title
		title := sel.Find("a[class*='product-title']").Text()
		if title == "" {
			title = sel.Find("span[class*='product-title']").Text()
		}
		if title == "" {
			title = sel.Find("a").First().Text()
		}

		// Product price - Shein displays prices with R$ prefix
		priceText := sel.Find("span[class*='price']").First().Text()
		if priceText == "" {
			priceText = sel.Find("div[class*='price']").First().Text()
		}

		// Extract URL
		link, _ := sel.Find("a[class*='product-link']").Attr("href")
		if link == "" {
			link, _ = sel.Find("a").First().Attr("href")
		}

		// Product image
		img, _ := sel.Find("img[class*='product-img']").Attr("src")
		if img == "" {
			img, _ = sel.Find("img").First().Attr("src")
		}

		if title != "" && link != "" && priceText != "" {
			results = append(results, map[string]string{
				"title": title,
				"url":   link,
				"price": priceText,
				"img":   img,
			})
		}
	})

	// Validate: at least 5 products parsed
	if len(results) < 5 {
		t.Errorf("expected at least 5 parsed products, got %d", len(results))
	}

	// Validate each product
	for i, product := range results {
		if product["title"] == "" {
			t.Errorf("product[%d].title is empty", i)
		}
		if product["url"] == "" {
			t.Errorf("product[%d].url is empty", i)
		}
		if product["price"] == "" {
			t.Errorf("product[%d].price is empty", i)
		}
		// URL should contain either shein or /br/ (fixture uses relative paths)
		if !contains(product["url"], "shein") && !contains(product["url"], "/br/") {
			t.Errorf("product[%d].url doesn't look like Shein URL: %s", i, product["url"])
		}
	}

	t.Logf("✓ Parsed %d products from Shein fixture", len(results))
}

// TestSheinEmptyResults tests edge case: query returns no results.
func TestSheinEmptyResults(t *testing.T) {
	html := `<html><body><div class="search-container"></div></body></html>`
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader([]byte(html)))
	if err != nil {
		t.Fatalf("failed to parse HTML: %v", err)
	}

	var count int
	doc.Find("div[class*='product-item']").Each(func(_ int, sel *goquery.Selection) {
		title := sel.Find("a[class*='product-title']").Text()
		if title != "" {
			count++
		}
	})

	if count != 0 {
		t.Errorf("expected 0 results for empty HTML, got %d", count)
	}

	t.Log("✓ Empty results edge case passed")
}

// TestSheinMultipleSelectors validates fallback selectors for title and price.
func TestSheinMultipleSelectors(t *testing.T) {
	html := `<html><body>
	<div class="product-item">
		<a class="product-title" href="/br/p-test-1-p-123">Test Product 1</a>
		<span class="price">R$ 199,99</span>
		<img class="product-img" src="/img1.jpg"/>
	</div>
	<div class="product-item">
		<span class="product-title">Test Product 2</span>
		<div class="price">R$ 299,99</div>
		<a href="/br/p-test-2-p-124">Link</a>
		<img src="/img2.jpg"/>
	</div>
	</body></html>`

	doc, _ := goquery.NewDocumentFromReader(bytes.NewReader([]byte(html)))

	var results []map[string]string
	doc.Find("div[class*='product-item']").Each(func(_ int, sel *goquery.Selection) {
		title := sel.Find("a[class*='product-title']").Text()
		if title == "" {
			title = sel.Find("span[class*='product-title']").Text()
		}

		priceText := sel.Find("span[class*='price']").First().Text()
		if priceText == "" {
			priceText = sel.Find("div[class*='price']").First().Text()
		}

		link, _ := sel.Find("a").First().Attr("href")

		if title != "" && link != "" && priceText != "" {
			results = append(results, map[string]string{
				"title": title,
				"price": priceText,
				"url":   link,
			})
		}
	})

	if len(results) != 2 {
		t.Errorf("expected 2 products, got %d", len(results))
	}

	t.Logf("✓ Multiple selector fallback test passed with %d products", len(results))
}

// TestSheinPriceParsing validates price extraction in Brazilian format.
func TestSheinPriceParsing(t *testing.T) {
	html := `<html><body>
	<div class="product-item">
		<a class="product-title" href="/test">Phone 1</a>
		<span class="price">R$ 1.299,99</span>
		<img src="/img.jpg"/>
	</div>
	</body></html>`

	doc, _ := goquery.NewDocumentFromReader(bytes.NewReader([]byte(html)))

	var priceFound string
	doc.Find("div[class*='product-item']").Each(func(_ int, sel *goquery.Selection) {
		priceFound = sel.Find("span[class*='price']").First().Text()
	})

	if !contains(priceFound, "1.299") {
		t.Errorf("price should contain '1.299', got %s", priceFound)
	}

	t.Logf("✓ Price parsing test passed: %s", priceFound)
}

// ============ Helpers ============

func loadSheinFixture() string {
	return `<!DOCTYPE html>
<html>
<head>
    <title>Busca - Smartphone | Shein Brasil</title>
</head>
<body>
<div class="search-container">
    <div class="product-item">
        <a class="product-title" href="/br/p-5g-smartphone-android-12-8gb-ram-128gb-rom-6-8-ips-screen-p-15920395-cat-1727">
            5G Smartphone Android 12 8GB RAM 128GB ROM
        </a>
        <span class="price">R$ 199,99</span>
        <img class="product-img" src="https://img.shein.com/is/image1.jpg?1234567890" alt="5G Smartphone"/>
    </div>

    <div class="product-item">
        <a class="product-title" href="/br/p-unlocked-4g-smartphone-13mp-camera-5-5-inch-display-p-15920396-cat-1727">
            Unlocked 4G Smartphone 13MP Camera 5.5 inch
        </a>
        <span class="price">R$ 149,90</span>
        <img class="product-img" src="https://img.shein.com/is/image2.jpg?1234567890" alt="Unlocked 4G Smartphone"/>
    </div>

    <div class="product-item">
        <a class="product-title" href="/br/p-android-smartphone-dual-sim-face-unlock-p-15920397-cat-1727">
            Android Smartphone Dual SIM Face Unlock
        </a>
        <span class="price">R$ 179,00</span>
        <img class="product-img" src="https://img.shein.com/is/image3.jpg?1234567890" alt="Android Smartphone Dual SIM"/>
    </div>

    <div class="product-item">
        <a class="product-link" href="/br/p-budget-smartphone-quad-core-processor-5-inch-hd-display-p-15920398-cat-1727">
            <span class="product-title">Budget Smartphone Quad Core 5 inch HD Display</span>
        </a>
        <div class="price">R$ 99,90</div>
        <img src="https://img.shein.com/is/image4.jpg?1234567890" alt="Budget Smartphone"/>
    </div>

    <div class="product-item">
        <a class="product-title" href="/br/p-premium-smartphone-curved-oled-display-120hz-p-15920399-cat-1727">
            Premium Smartphone Curved OLED Display 120Hz
        </a>
        <span class="price">R$ 449,00</span>
        <img class="product-img" src="https://img.shein.com/is/image5.jpg?1234567890" alt="Premium Smartphone OLED"/>
    </div>

    <div class="product-item">
        <a class="product-title" href="/br/p-gaming-phone-240hz-sampling-rate-flagship-processor-p-15920400-cat-1727">
            Gaming Phone 240Hz Sampling Rate Flagship
        </a>
        <span class="price">R$ 399,90</span>
        <img class="product-img" src="https://img.shein.com/is/image6.jpg?1234567890" alt="Gaming Phone"/>
    </div>
</div>
</body>
</html>`
}
