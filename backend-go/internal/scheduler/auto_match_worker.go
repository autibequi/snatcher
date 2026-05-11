package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/notifier"
	"snatcher/backendv2/internal/store"
)

// RunAutoMatchWorker executa o ciclo de auto-match: busca produtos recentes,
// calcula score com todos os canais e dispara para os grupos dos canais com score >= threshold.
func RunAutoMatchWorker(ctx context.Context, st store.Store, notif *notifier.Notifier) {
	_ = runAutoMatchCycle(ctx, st, time.Now(), false, nil, notif)
}

// sortProductsByBestAutoMatchScore replica a prioridade «melhor score primeiro» da prévia por canal,
// mantendo empates estáveis por updated_at DESC.
func sortProductsByBestAutoMatchScore(cfg models.AppConfig, st store.Store, products []models.CatalogProduct, channels []models.Channel, autoBy map[int64]models.ChannelAutomation, clicksByChannelID map[int64]int) []models.CatalogProduct {
	type ranked struct {
		p    models.CatalogProduct
		best float64
	}
	outRank := make([]ranked, 0, len(products))
	for _, p := range products {
		if !p.LowestPriceURL.Valid || p.LowestPriceURL.String == "" {
			outRank = append(outRank, ranked{p: p, best: -1})
			continue
		}
		taxonomies, _ := st.ListProductTaxonomies(p.ID)
		attrs := ParseProductAttributes(p)
		input := match.ProductInput{
			Name:     p.CanonicalName,
			Category: firstTag(p),
			Price:    nullFloat(p.LowestPrice),
			Drop:     ProductDropPercent(st, p),
		}
		if p.Brand.Valid {
			input.Brand = p.Brand.String
		}
		price := nullFloat(p.LowestPrice)
		scores := match.RankChannelsDetailed(input, channels, taxonomies, attrs, clicksByChannelID)
		best := -1.0
		for _, s := range scores {
			auto, ok := autoBy[s.ChannelID]
			if !ok {
				continue
			}
			threshold := cfg.AutoMatchThreshold
			if auto.Threshold.Valid {
				threshold = auto.Threshold.Float64
			}
			if threshold <= 0 {
				threshold = 50
			}
			matchValue := ""
			if auto.MatchValue.Valid {
				matchValue = auto.MatchValue.String
			}
			maxPrice := 0.0
			if auto.MaxPrice.Valid {
				maxPrice = auto.MaxPrice.Float64
			}
			if !match.MatchesChannelFilter(input, price, auto.MatchType, matchValue, maxPrice) {
				continue
			}
			if s.Value < threshold {
				continue
			}
			if s.Value > best {
				best = s.Value
			}
		}
		outRank = append(outRank, ranked{p: p, best: best})
	}
	sort.SliceStable(outRank, func(i, j int) bool {
		if outRank[i].best != outRank[j].best {
			return outRank[i].best > outRank[j].best
		}
		// Sem canal elegível neste lote: mantém ordem por frescor de scrape
		return outRank[i].p.UpdatedAt.After(outRank[j].p.UpdatedAt)
	})
	out := make([]models.CatalogProduct, len(outRank))
	for i := range outRank {
		out[i] = outRank[i].p
	}
	return out
}

func firstTag(p models.CatalogProduct) string {
	tags := p.GetTags()
	if len(tags) > 0 {
		return tags[0]
	}
	return ""
}

func nullFloat(n models.NullFloat64) float64 {
	if n.Valid {
		return n.Float64
	}
	return 0
}

func buildAutoMatchMessage(p models.CatalogProduct) string {
	price := nullFloat(p.LowestPrice)
	name := p.CanonicalName
	if price > 0 {
		return fmt.Sprintf("🔥 %s\n💰 R$ %.2f\n\n{link}", name, price)
	}
	return "🔥 " + name + "\n\n{link}"
}

// ParseProductAttributes extrai mapa de atributos do campo Attributes (JSONB) do produto.
// Formato esperado: {"color": [1, 2], "size": [3, 4]}
// Se o campo estiver vazio ou inválido, retorna map vazio.
func ParseProductAttributes(p models.CatalogProduct) map[string][]int64 {
	result := make(map[string][]int64)
	if len(p.Attributes) == 0 {
		return result
	}
	err := json.Unmarshal(p.Attributes, &result)
	if err != nil {
		slog.Warn("parse product attributes", "product_id", p.ID, "err", err)
		return make(map[string][]int64)
	}
	return result
}

// ProductDropPercent estima % de desconto (0–100+) a partir do menor preço vs original_price nas variantes.
// Usado no score de match (componente Drop); sem metadata de preço original retorna 0.
func ProductDropPercent(st store.Store, p models.CatalogProduct) float64 {
	variants, err := st.ListVariantsByProduct(p.ID)
	if err != nil || len(variants) == 0 {
		return 0
	}
	_ = st.HydrateVariantPricesFromHistory(variants)
	price := nullFloat(p.LowestPrice)
	if price <= 0 {
		for _, v := range variants {
			if v.Price > 0 && (price <= 0 || v.Price < price) {
				price = v.Price
			}
		}
	}
	var maxOrig float64
	for _, v := range variants {
		var meta models.CrawlMetadata
		if len(v.Metadata) > 0 {
			_ = json.Unmarshal(v.Metadata, &meta)
		}
		if meta.OriginalPrice > v.Price && meta.OriginalPrice > maxOrig {
			maxOrig = meta.OriginalPrice
		}
	}
	if maxOrig > 0 && price > 0 && maxOrig > price {
		return (maxOrig - price) / maxOrig * 100
	}
	return 0
}
