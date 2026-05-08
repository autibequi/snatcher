package pipeline

import (
	"context"
	"database/sql"
	"log/slog"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strings"
)

// Thresholds de match em zonas:
// - HIGH:  ≥ 0.90 + peso/quantity batem → auto-merge (match_method=fuzzy_high)
// - GRAY:  0.65 ≤ score < 0.90 OU peso conflita → vai pra LLM (match_method=llm_tiebreaker)
// - NONE:  < 0.65 → produto novo (match_method=new_product)
const fuzzyThreshold = 0.80 // legado, mantido para compat
const matchHighConfidence = 0.90
const matchGrayLow = 0.65

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

	// Descarta resultados sem preço — produto sem preço não pode ser disparado
	if r.Price <= 0 {
		return 0, st.MarkCrawlResultProcessed(r.ID, 0)
	}

	// Nova URL — normalizar e buscar produto matching
	canonical := NormalizeTitle(r.Title)
	weight := ExtractWeight(r.Title)
	variantLabel := ExtractVariantLabel(r.Title)

	// Match com 3 zonas: top score + weight check
	matchedProduct, matchScore, matchMethod := findBestMatch(canonical, weight, products)

	var productID int64
	if matchedProduct != nil {
		productID = matchedProduct.ID
	} else {
		matchMethod = "new_product"
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

	// Preenche brand a partir da taxonomia, se ainda não preenchida
	if !refreshedProduct.Brand.Valid && len(matchedIDs) > 0 {
		if taxEntries, err := st.GetTaxonomyByIDs(matchedIDs); err == nil {
			for _, t := range taxEntries {
				if t.Type == "brand" {
					refreshedProduct.Brand = models.NullString{NullString: sql.NullString{String: t.Name, Valid: true}}
					// Limpa duplicações da marca no canonical_name
					refreshedProduct.CanonicalName = CleanTitle(refreshedProduct.CanonicalName, t.Name)
					break
				}
			}
		}
	}

	// Triagem: produto sem marca detectada → pending (precisa revisão humana ou LLM).
	// Com marca + categoria → auto (pipeline barato cobriu).
	hasBrand := refreshedProduct.Brand.Valid && refreshedProduct.Brand.String != ""
	hasCategory := len(matchedIDs) > 0 || len(refreshedProduct.GetTags()) > 0
	if !hasBrand || !hasCategory {
		if refreshedProduct.CurationStatus == "" || refreshedProduct.CurationStatus == "auto" {
			refreshedProduct.CurationStatus = "pending"
		}
	} else if refreshedProduct.CurationStatus == "" || refreshedProduct.CurationStatus == "pending" {
		refreshedProduct.CurationStatus = "auto"
	}
	_ = st.UpdateCatalogProduct(refreshedProduct)

	// Cria variante com metadados de match (P-MERGE / task #35) e enriquecidos (task #34)
	v := models.CatalogVariant{
		CatalogProductID: productID,
		Title:            r.Title,
		Price:            r.Price,
		URL:              r.URL,
		ImageURL:         r.ImageURL,
		Source:           r.Source,
		MatchConfidence:  models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: matchScore, Valid: matchScore > 0}},
		MatchMethod:      models.NullString{NullString: sql.NullString{String: matchMethod, Valid: matchMethod != ""}},
		Metadata:         r.Metadata, // propaga JSON enriquecido do crawler
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
		if MatchesWordBoundary(titleLower, strings.ToLower(kw.Keyword)) {
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

// findBestMatch retorna o produto candidato com maior score Levenshtein, junto com:
// - score (0..1)
// - método: "fuzzy_high" (auto-merge, score≥0.90 e weight match), "llm_tiebreaker" (gray zone), ""
//
// Lógica de zonas:
//   score ≥ 0.90 + weight bate (ou ambos vazios) → fuzzy_high (merge automático)
//   score ≥ 0.90 + weight conflita               → llm_tiebreaker (LLM decide)
//   0.65 ≤ score < 0.90                          → llm_tiebreaker (zona cinza)
//   score < 0.65                                 → nil (produto novo)
//
// O caller (processResult) chama LLM se método == "llm_tiebreaker"; caso LLM
// confirme não-match, sobe pra produto novo.
func findBestMatch(canonical, weight string, products []models.CatalogProduct) (*models.CatalogProduct, float64, string) {
	var best *models.CatalogProduct
	bestScore := 0.0
	for i := range products {
		score := FuzzyScore(canonical, products[i].CanonicalName)
		if score > bestScore {
			bestScore = score
			best = &products[i]
		}
	}
	if best == nil || bestScore < matchGrayLow {
		return nil, bestScore, ""
	}

	// Weight check — se ambos têm peso e divergem, downgrada pra zona cinza.
	weightMatch := true
	bestWeight := ""
	if best.Weight.Valid {
		bestWeight = best.Weight.String
	}
	if weight != "" && bestWeight != "" {
		weightMatch = strings.EqualFold(strings.TrimSpace(weight), strings.TrimSpace(bestWeight))
	}

	if bestScore >= matchHighConfidence && weightMatch {
		return best, bestScore, "fuzzy_high"
	}
	// Zona cinza: score alto mas peso conflita, OU score 0.65-0.90.
	return best, bestScore, "llm_tiebreaker"
}
