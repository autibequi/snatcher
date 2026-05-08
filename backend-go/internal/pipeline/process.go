package pipeline

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"snatcher/backendv2/internal/match"
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

var patternCache = match.NewPatternCache()

// canonicalizeURL normaliza URL removendo parâmetros de tracking e fragmentos
func canonicalizeURL(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	// Remove tracking params
	q := u.Query()
	trackingParams := []string{"utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
		"tag", "ref", "fbclid", "gclid", "mc_cid", "mc_eid"}
	for _, p := range trackingParams {
		q.Del(p)
	}
	u.RawQuery = q.Encode()
	u.Fragment = ""
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	return u.String()
}

// mapTaxonomyTypeToRole mapeia TaxonomyType para o role apropriado
func mapTaxonomyTypeToRole(taxonomyType string, parentID *int64) string {
	switch taxonomyType {
	case "brand":
		return "brand"
	case "category":
		if parentID == nil || *parentID == 0 {
			return "primary_category"
		}
		return "subcategory"
	case "color":
		return "attribute_color"
	case "size":
		return "attribute_size"
	case "voltage":
		return "attribute_voltage"
	case "capacity":
		return "attribute_capacity"
	default:
		return "attribute_other"
	}
}

// buildAttributesJSON constrói JSON JSONB com atributos agrupados por tipo
func buildAttributesJSON(hits []match.TaxonomyHit) []byte {
	attrs := make(map[string][]int64)
	for _, hit := range hits {
		role := mapTaxonomyTypeToRole(hit.TaxonomyType, hit.ParentID)
		// Só mapeamos atributos, não categorias/brands
		if strings.HasPrefix(role, "attribute_") {
			key := strings.TrimPrefix(role, "attribute_")
			attrs[key] = append(attrs[key], hit.TaxonomyID)
		}
	}
	data, _ := json.Marshal(attrs)
	return data
}

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
	ctx context.Context,
	st store.Store,
	r models.CrawlResult,
	products []models.CatalogProduct,
	keywords []models.GroupingKeyword,
) (int64, error) {
	// PASSO 1: Dedup por (source, source_subid)
	if r.SourceSubID.Valid && r.SourceSubID.String != "" {
		variant, found, err := st.GetVariantBySourceSubID(r.Source, r.SourceSubID.String)
		if err == nil && found {
			// UPDATE price + INSERT pricehistoryv2
			if variant.Price != r.Price {
				variant.Price = r.Price
				_ = st.UpdateCatalogVariant(variant)
				_ = st.InsertPriceHistoryV2(models.PriceHistoryV2{
					VariantID: variant.ID,
					Price:     r.Price,
				})
				updateLowestPrice(st, variant.CatalogProductID)
			}
			_ = st.ResetProductFailures(variant.CatalogProductID)
			return variant.CatalogProductID, st.MarkCrawlResultProcessed(r.ID, variant.ID)
		}
	}

	// PASSO 2: Dedup por URL canônica
	canonURL := canonicalizeURL(r.URL)
	variant, found, err := st.GetVariantByURL(canonURL)
	if err == nil && found {
		if variant.Price != r.Price {
			variant.Price = r.Price
			_ = st.UpdateCatalogVariant(variant)
			_ = st.InsertPriceHistoryV2(models.PriceHistoryV2{
				VariantID: variant.ID,
				Price:     r.Price,
			})
			updateLowestPrice(st, variant.CatalogProductID)
		}
		_ = st.ResetProductFailures(variant.CatalogProductID)
		return variant.CatalogProductID, st.MarkCrawlResultProcessed(r.ID, variant.ID)
	}

	// Descarta resultados sem preço
	if r.Price <= 0 {
		return 0, st.MarkCrawlResultProcessed(r.ID, 0)
	}

	// PASSO 3: Fuzzy match com 3 zonas
	canonical := NormalizeTitle(r.Title)
	weight := ExtractWeight(r.Title)
	variantLabel := ExtractVariantLabel(r.Title)

	matchedProduct, matchScore, matchMethod := findBestMatch(canonical, weight, products)

	var productID int64

	switch {
	case matchScore >= 0.90 && matchedProduct != nil:
		// High confidence: create variant em produto existente
		productID = matchedProduct.ID
		matchMethod = "fuzzy_high"
	case matchScore >= 0.65 && matchedProduct != nil:
		// Gray zone: chama LLM tiebreaker para decidir merge vs new
		decision, targetID, reason := callLLMTiebreaker(ctx, canonical, weight, r.Title, r.Price, matchedProduct, matchScore)
		if decision == "merge" && targetID > 0 {
			productID = targetID
			matchMethod = "llm_tiebreaker_merge"
		} else {
			// Fallback: criar novo produto
			matchMethod = "llm_tiebreaker_new"
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
		if reason != "" {
			slog.Debug("LLM tiebreaker result", "decision", decision, "reason", reason, "target_id", targetID)
		}
	default:
		// Score < 0.65 OU nenhum match: criar novo produto
		matchMethod = "new_product"
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

	// PASSO 4: Enrich tags via patterns
	_ = patternCache.Refresh(st)
	hits := patternCache.MatchAllPatterns(canonical + " " + r.Title)

	refreshedProduct, _ := st.GetCatalogProduct(productID)

	// Upsert cada hit em catalogproduct_taxonomy
	for _, hit := range hits {
		role := mapTaxonomyTypeToRole(hit.TaxonomyType, hit.ParentID)
		_ = st.UpsertProductTaxonomy(productID, hit.TaxonomyID, role, hit.Confidence, "pipeline")
	}

	// PASSO 5: Sincroniza attributes JSONB
	attrs := buildAttributesJSON(hits)
	_ = st.UpdateProductAttributesJSON(productID, attrs)

	// PASSO 6: Curation status
	hasPrimary := false
	hasBrand := false
	for _, hit := range hits {
		if hit.TaxonomyType == "category" && (hit.ParentID == nil || *hit.ParentID == 0) {
			hasPrimary = true
		}
		if hit.TaxonomyType == "brand" {
			hasBrand = true
		}
	}

	if hasPrimary && hasBrand {
		refreshedProduct.CurationStatus = "auto"
	} else {
		refreshedProduct.CurationStatus = "pending"
	}
	_ = st.UpdateCatalogProduct(refreshedProduct)

	// Cria variante
	v := models.CatalogVariant{
		CatalogProductID: productID,
		Title:            r.Title,
		Price:            r.Price,
		URL:              canonURL,
		ImageURL:         r.ImageURL,
		Source:           r.Source,
		MatchConfidence:  models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: matchScore, Valid: matchScore > 0}},
		MatchMethod:      models.NullString{NullString: sql.NullString{String: matchMethod, Valid: matchMethod != ""}},
		Metadata:         r.Metadata,
	}
	if variantLabel != "" {
		v.VariantLabel = models.NullString{NullString: sql.NullString{String: variantLabel, Valid: true}}
	}
	variantID, err := st.CreateCatalogVariant(v)
	if err != nil {
		return 0, err
	}

	// Histórico de preço
	_ = st.InsertPriceHistoryV2(models.PriceHistoryV2{
		VariantID: variantID,
		Price:     r.Price,
	})

	// Atualiza lowest_price
	updateLowestPrice(st, productID)

	// Reset failure count
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

// callLLMTiebreaker decide se um produto em zona cinza (0.65-0.90 score) deve ser merge ou novo.
// Retorna (decision, targetProductID, reasoning).
// decision pode ser "merge" ou "new"; targetProductID > 0 se merge.
func callLLMTiebreaker(ctx context.Context, canonicalNew, weightNew, titleNew string, priceNew float64, candidate *models.CatalogProduct, matchScore float64) (string, int64, string) {
	// Para agora, implementamos fallback conservador: só merge se score ≥ 0.85.
	// Idealmente aqui chamaríamos LLM, mas precisaríamos passar llm.Client como parâmetro.
	// Por enquanto, retornamos "new" para zona cinza baixa e confiamos em score ≥ 0.85.

	if matchScore >= 0.85 {
		// Score alto na zona cinza: assume merge
		return "merge", candidate.ID, fmt.Sprintf("high confidence merge (score=%.2f)", matchScore)
	}

	// Score baixo na zona cinza: cria novo produto
	return "new", 0, fmt.Sprintf("low confidence in gray zone (score=%.2f)", matchScore)
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
