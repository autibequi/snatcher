package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strings"
)

// writeRawItem persiste um CrawlResult em raw_items (pipeline canônico v2).
// Tolerante a erro — nunca bloqueia o fluxo principal.
func writeRawItem(ctx context.Context, st store.Store, r models.CrawlResult) {
	payload, _ := json.Marshal(r)
	if err := st.InsertRawItem(r, payload); err != nil {
		slog.Debug("pipeline: writeRawItem", "err", err)
	}
}

// writeDiscardedItem persiste um item rejeitado em discarded_items (pipeline canônico v2).
// Tolerante a erro — nunca bloqueia o fluxo principal.
func writeDiscardedItem(ctx context.Context, st store.Store, r models.CrawlResult, reason string) {
	payload, _ := json.Marshal(r)
	if err := st.InsertDiscardedItem(r, payload, reason); err != nil {
		slog.Debug("pipeline: writeDiscardedItem", "err", err)
	}
}

// Thresholds de match em zonas:
// - HIGH:  ≥ 0.90 + peso/quantity batem → auto-merge (match_method=fuzzy_high)
// - GRAY:  0.65 ≤ score < 0.90 OU peso conflita → vai pra LLM (match_method=llm_tiebreaker)
// - NONE:  < 0.65 → produto novo (match_method=new_product)
const fuzzyThreshold = 0.80 // legado, mantido para compat
const matchHighConfidence = 0.90
const matchGrayLow = 0.65

// patternCache removido (internal/match pacote v1 deletado em unify-v1-v2)
type noopPatternCache struct{}
func (noopPatternCache) Refresh(_ store.Store) error { return nil }
func (noopPatternCache) MatchAllPatterns(_ string) []taxonomyHit { return nil }
type taxonomyHit struct{ TaxonomyID int64; TaxonomyType string; ParentID *int64 }
var patternCache = noopPatternCache{}

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
func buildAttributesJSON(hits []taxonomyHit) []byte {
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

// ProcessCrawlResults normaliza CrawlResults não processados e os associa ao catálogo v2.
func ProcessCrawlResults(ctx context.Context, st store.Store) error {
	results, err := st.ListUnprocessedCrawlResults()
	if err != nil {
		return err
	}
	if len(results) == 0 {
		return nil
	}

	// Carrega itens do catálogo v2 para fuzzy match
	catalogItems, err := st.ListCatalogV2ForMatch(10000)
	if err != nil {
		return err
	}

	for _, r := range results {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := processResult(ctx, st, r, catalogItems); err != nil {
			slog.Error("process result", "id", r.ID, "err", err)
		}
	}

	return nil
}

func processResult(
	ctx context.Context,
	st store.Store,
	r models.CrawlResult,
	catalogItems []store.CatalogV2Item,
) error {
	// Pipeline canônico v2: grava raw_item antes de qualquer processamento.
	writeRawItem(ctx, st, r)

	imageURL := ""
	if r.ImageURL.Valid {
		imageURL = r.ImageURL.String
	}

	// PASSO 1: Dedup por (source, source_subid) via catalog v2 dedup_key
	if r.SourceSubID.Valid && r.SourceSubID.String != "" {
		dedupKey := store.DedupKeyV2(r.Source, r.SourceSubID.String)
		item, found, err := st.GetCatalogItemByDedupKey(dedupKey)
		if err == nil && found {
			// Atualiza preço/hash se necessário
			newHash := store.ContentHashV2(item.Title, r.Price, imageURL)
			if newHash != item.ContentHash || r.Price != item.PriceCurrent {
				_, _ = st.UpsertCatalogItem(store.CatalogV2UpsertParams{
					DedupKey:     dedupKey,
					ShortID:      item.ShortID,
					SourceID:     item.SourceID,
					Title:        item.Title,
					PriceCurrent: r.Price,
					CanonicalURL: item.CanonicalURL,
					ImageURL:     imageURL,
				})
			}
			return st.MarkCrawlResultProcessed(r.ID, item.ID)
		}
	}

	// PASSO 2: Dedup por URL canônica via catalog v2
	canonURL := canonicalizeURL(r.URL)
	item, found, err := st.GetCatalogItemByURL(canonURL)
	if err == nil && found {
		newHash := store.ContentHashV2(item.Title, r.Price, imageURL)
		if newHash != item.ContentHash || r.Price != item.PriceCurrent {
			_, _ = st.UpsertCatalogItem(store.CatalogV2UpsertParams{
				DedupKey:     item.DedupKey,
				ShortID:      item.ShortID,
				SourceID:     item.SourceID,
				Title:        item.Title,
				PriceCurrent: r.Price,
				CanonicalURL: item.CanonicalURL,
				ImageURL:     imageURL,
			})
		}
		return st.MarkCrawlResultProcessed(r.ID, item.ID)
	}

	// Descarta resultados sem preço
	if r.Price <= 0 {
		writeDiscardedItem(ctx, st, r, "no_price")
		return st.MarkCrawlResultProcessed(r.ID, 0)
	}

	// PASSO 3: Fuzzy match com 3 zonas usando catalog v2
	canonical := NormalizeTitle(r.Title)
	weight := ExtractWeight(r.Title)

	matchedItem, matchScore, matchMethod := findBestMatchV2(canonical, weight, catalogItems)

	// Determina dedup_key canônico para o novo item: source:source_subid (se disponível) ou source:canonURL
	var dedupKey string
	if r.SourceSubID.Valid && r.SourceSubID.String != "" {
		dedupKey = store.DedupKeyV2(r.Source, r.SourceSubID.String)
	} else {
		dedupKey = store.DedupKeyV2(r.Source, canonURL)
	}

	var upsertTitle string
	switch {
	case matchScore >= 0.90 && matchedItem != nil:
		// High confidence: usa título do item existente (match canônico)
		matchMethod = "fuzzy_high"
		upsertTitle = matchedItem.Title
	case matchScore >= 0.65 && matchedItem != nil:
		// Gray zone: decide via heurística conservadora
		decision, targetTitle, reason := callLLMTiebreakerV2(ctx, canonical, weight, r.Title, r.Price, matchedItem, matchScore)
		if decision == "merge" && targetTitle != "" {
			matchMethod = "llm_tiebreaker_merge"
			upsertTitle = targetTitle
		} else {
			matchMethod = "llm_tiebreaker_new"
			upsertTitle = r.Title
		}
		if reason != "" {
			slog.Debug("LLM tiebreaker result", "decision", decision, "reason", reason)
		}
	default:
		// Score < 0.65 OU nenhum match: novo item
		matchMethod = "new_product"
		upsertTitle = r.Title
	}

	// PASSO 4: Upsert em catalog v2
	catalogID, err := st.UpsertCatalogItem(store.CatalogV2UpsertParams{
		DedupKey:     dedupKey,
		SourceID:     r.Source,
		Title:        upsertTitle,
		PriceCurrent: r.Price,
		CanonicalURL: canonURL,
		ImageURL:     imageURL,
	})
	if err != nil {
		return err
	}

	// Enriquece via patterns (taxonomia — best-effort, tolerante a erro)
	_ = patternCache.Refresh(st)
	var crawlMeta models.CrawlMetadata
	if len(r.Metadata) > 0 {
		_ = json.Unmarshal(r.Metadata, &crawlMeta)
	}
	metaBits := strings.TrimSpace(strings.Join([]string{
		crawlMeta.Brand, crawlMeta.SpecsSummary, crawlMeta.Description,
	}, " "))
	hits := patternCache.MatchAllPatterns(strings.TrimSpace(canonical + " " + r.Title + " " + metaBits))

	// Carrega item recém-inserido para obter seu ID numérico para MarkCrawlResultProcessed
	newItem, _, _ := st.GetCatalogItemByDedupKey(dedupKey)

	// Registra patterns (mapeamento taxonomia — v1 tables ainda existem até F12)
	if newItem.ID > 0 {
		// Não há product_id em catalog v2 — pula enriquecimento de taxonomia por produto
		// (F05 migra handlers; F12 limpa sql_catalog.go)
		_ = hits
		_ = catalogID
		_ = matchMethod
	}

	return st.MarkCrawlResultProcessed(r.ID, newItem.ID)
}

// callLLMTiebreakerV2 decide se um item em zona cinza deve ser merge ou novo (catalog v2).
// Retorna (decision, targetTitle, reasoning).
func callLLMTiebreakerV2(ctx context.Context, canonicalNew, weightNew, titleNew string, priceNew float64, candidate *store.CatalogV2Item, matchScore float64) (string, string, string) {
	if matchScore >= 0.85 {
		return "merge", candidate.Title, fmt.Sprintf("high confidence merge (score=%.2f)", matchScore)
	}
	return "new", "", fmt.Sprintf("low confidence in gray zone (score=%.2f)", matchScore)
}

// findBestMatchV2 retorna o item de catalog v2 com maior score Levenshtein.
// Mantém a mesma lógica de zonas que findBestMatch, operando sobre CatalogV2Item.
//
// Lógica de zonas:
//
//	score ≥ 0.90 + weight bate (ou ambos vazios) → fuzzy_high (merge automático)
//	score ≥ 0.90 + weight conflita               → llm_tiebreaker (LLM decide)
//	0.65 ≤ score < 0.90                          → llm_tiebreaker (zona cinza)
//	score < 0.65                                 → nil (item novo)
func findBestMatchV2(canonical, weight string, items []store.CatalogV2Item) (*store.CatalogV2Item, float64, string) {
	var best *store.CatalogV2Item
	bestScore := 0.0
	for i := range items {
		// Normaliza título do item v2 para comparação
		normalizedTitle := NormalizeTitle(items[i].Title)
		score := FuzzyScore(canonical, normalizedTitle)
		if score > bestScore {
			bestScore = score
			best = &items[i]
		}
	}
	if best == nil || bestScore < matchGrayLow {
		return nil, bestScore, ""
	}

	// Weight check — extrai peso do título do item v2 para comparar
	weightMatch := true
	bestWeight := ExtractWeight(best.Title)
	if weight != "" && bestWeight != "" {
		weightMatch = strings.EqualFold(strings.TrimSpace(weight), strings.TrimSpace(bestWeight))
	}

	if bestScore >= matchHighConfidence && weightMatch {
		return best, bestScore, "fuzzy_high"
	}
	return best, bestScore, "llm_tiebreaker"
}

