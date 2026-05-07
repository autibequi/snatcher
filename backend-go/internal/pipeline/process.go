package pipeline

import (
	"context"
	"database/sql"
	"log/slog"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strings"
)

const fuzzyThreshold = 0.80

// ProcessCrawlResults normaliza CrawlResults não processados e os associa ao catálogo.
func ProcessCrawlResults(ctx context.Context, st store.Store) error {
	results, err := st.ListUnprocessedCrawlResults()
	if err != nil {
		return err
	}
	if len(results) == 0 {
		return nil
	}

	keywords, _ := st.ListGroupingKeywords()

	// Carrega todos os produtos do catálogo para fuzzy match
	products, err := st.ListCatalogProducts(10000, 0, true)
	if err != nil {
		return err
	}

	// Track which products were successfully found in this crawl
	successfulProductIDs := make(map[int64]bool)

	for _, r := range results {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if productID, err := processResult(ctx, st, r, products, keywords); err != nil {
			slog.Error("process result", "id", r.ID, "err", err)
		} else if productID > 0 {
			successfulProductIDs[productID] = true
		}
	}

	// Não incrementa falhas aqui — buscas por keyword não garantem redescobrir
	// todos os produtos existentes. Falhas só devem ser incrementadas via scraper
	// direto de URL, não por ausência em resultado de busca.

	return nil
}

func processResult(
	_ context.Context,
	st store.Store,
	r models.CrawlResult,
	products []models.CatalogProduct,
	keywords []models.GroupingKeyword,
) (int64, error) {
	// Verifica se já existe por URL
	existing, found, err := st.GetVariantByURL(r.URL)
	if err != nil {
		return 0, err
	}
	if found {
		// URL já no catálogo — atualiza preço se mudou
		if existing.Price != r.Price {
			existing.Price = r.Price
			_ = st.UpdateCatalogVariant(existing)
			_ = st.InsertPriceHistoryV2(models.PriceHistoryV2{
				VariantID: existing.ID,
				Price:     r.Price,
			})
			// Atualiza lowest_price no produto pai
			updateLowestPrice(st, existing.CatalogProductID)
		}
		// Reset failure count for successful re-crawl
		_ = st.ResetProductFailures(existing.CatalogProductID)
		return existing.CatalogProductID, st.MarkCrawlResultProcessed(r.ID, existing.ID)
	}

	// Nova URL — normalizar e buscar produto matching
	canonical := NormalizeTitle(r.Title)
	weight := ExtractWeight(r.Title)
	variantLabel := ExtractVariantLabel(r.Title)

	var matchedProduct *models.CatalogProduct
	for i := range products {
		if FuzzyMatch(canonical, products[i].CanonicalName, fuzzyThreshold) {
			matchedProduct = &products[i]
			break
		}
	}

	var productID int64
	if matchedProduct != nil {
		productID = matchedProduct.ID
	} else {
		// Cria novo produto canônico
		p := models.CatalogProduct{
			CanonicalName: canonical,
			Tags:          "[]",
			Quantity:      ExtractQuantity(r.Title),
		}
		if weight != "" {
			p.Weight = models.NullString{NullString: sql.NullString{String: weight, Valid: true}}
		}
		if r.ImageURL.Valid {
			p.ImageURL = r.ImageURL
		}
		newID, err := st.CreateCatalogProduct(p)
		if err != nil {
			return 0, err
		}
		productID = newID
		p.ID = newID
		products = append(products, p)
		matchedProduct = &products[len(products)-1]
	}

	// Aplica grouping keywords e enriquece tags com categorias detectadas
	refreshedProduct, _ := st.GetCatalogProduct(productID)
	tags := EnrichTags(refreshedProduct.CanonicalName, refreshedProduct.GetTags())
	refreshedProduct.SetTags(tags)
	_ = st.UpdateCatalogProduct(refreshedProduct)
	applyKeywords(st, &refreshedProduct, r.Title, keywords)

	// Detecta taxonomias (categorias/marcas) no nome canônico — incrementa
	// detect_count das taxonomias matchadas para fine-tuning de keywords.
	matchedIDs, _ := st.DetectAndUpsertTaxonomy(refreshedProduct.CanonicalName)
	// Sem inferência automática → marcar pending para curadoria manual.
	// Com inferência → marcar curated (auto) para não cair na fila.
	if len(matchedIDs) == 0 && refreshedProduct.CurationStatus == "" {
		refreshedProduct.CurationStatus = "pending"
		_ = st.UpdateCatalogProduct(refreshedProduct)
	} else if len(matchedIDs) > 0 && (refreshedProduct.CurationStatus == "" || refreshedProduct.CurationStatus == "pending") {
		refreshedProduct.CurationStatus = "auto"
		_ = st.UpdateCatalogProduct(refreshedProduct)
	}

	// Cria variante
	v := models.CatalogVariant{
		CatalogProductID: productID,
		Title:            r.Title,
		Price:            r.Price,
		URL:              r.URL,
		ImageURL:         r.ImageURL,
		Source:           r.Source,
	}
	if variantLabel != "" {
		v.VariantLabel = models.NullString{NullString: sql.NullString{String: variantLabel, Valid: true}}
	}
	variantID, err := st.CreateCatalogVariant(v)
	if err != nil {
		return 0, err
	}

	// Histórico de preço inicial
	_ = st.InsertPriceHistoryV2(models.PriceHistoryV2{
		VariantID: variantID,
		Price:     r.Price,
	})

	// Atualiza lowest_price
	updateLowestPrice(st, productID)

	// Reset failure count for successful crawl
	_ = st.ResetProductFailures(productID)

	return productID, st.MarkCrawlResultProcessed(r.ID, variantID)
}

func applyKeywords(st store.Store, p *models.CatalogProduct, title string, keywords []models.GroupingKeyword) {
	titleLower := strings.ToLower(title)
	changed := false
	for _, kw := range keywords {
		if !kw.Active {
			continue
		}
		if strings.Contains(titleLower, strings.ToLower(kw.Keyword)) {
			existing := p.GetTags()
			found := false
			for _, t := range existing {
				if t == kw.Tag {
					found = true
					break
				}
			}
			if !found {
				p.AddTag(kw.Tag)
				changed = true
			}
		}
	}
	if changed {
		_ = st.UpdateCatalogProduct(*p)
	}
}

func updateLowestPrice(st store.Store, productID int64) {
	variants, err := st.ListVariantsByProduct(productID)
	if err != nil || len(variants) == 0 {
		return
	}

	p, err := st.GetCatalogProduct(productID)
	if err != nil {
		return
	}

	lowest := variants[0]
	for _, v := range variants[1:] {
		if v.Price < lowest.Price {
			lowest = v
		}
	}

	p.LowestPrice = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: lowest.Price, Valid: true}}
	p.LowestPriceURL = models.NullString{NullString: sql.NullString{String: lowest.URL, Valid: true}}
	p.LowestPriceSource = models.NullString{NullString: sql.NullString{String: lowest.Source, Valid: true}}
	if !p.ImageURL.Valid && lowest.ImageURL.Valid {
		p.ImageURL = lowest.ImageURL
	}

	_ = st.UpdateCatalogProduct(p)
}
