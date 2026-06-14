// Package selection escolhe, de forma determinística, qual produto enfileirar para cada
// grupo ativo. Substitui o algo.tick (bandit) removido na W1.
//
// Fluxo (W4 refactor 2026-06): candidatos do catalog v2 → target.Match (filtro duro por
// categoria/preço/black-whitelist) → match.Score (ranqueia por qualidade/desconto) →
// dedup anti-repeat (group_sent_history) → enfileira no send_queue.
package selection

import (
	"sort"

	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/target"
)

// Candidate é um produto do catálogo elegível para seleção.
type Candidate struct {
	CatalogID     int64
	CategoryID    int64
	Price         float64
	PriceOriginal float64
	Title         string
	QualityScore  float64
	DiscountPct   float64
	DedupKey      string
	Score         float64 // preenchido por Rank (match.Score)
}

// Rank filtra os candidatos pelo público-alvo (target.Match) e ordena por score
// decrescente (match.Score). Função pura, sem I/O — o coração testável da seleção.
func Rank(cands []Candidate, tcfg target.Config, ch models.ChannelV2) []Candidate {
	out := make([]Candidate, 0, len(cands))
	for _, c := range cands {
		if ok, _ := target.Match(target.Product{CategoryID: c.CategoryID, Price: c.Price, Title: c.Title}, tcfg); !ok {
			continue
		}
		catID := c.CategoryID
		res := match.Score(match.CatalogItem{
			ID:            c.CatalogID,
			CategoryID:    &catID,
			QualityScore:  c.QualityScore,
			DiscountPct:   c.DiscountPct,
			PriceCurrent:  c.Price,
			PriceOriginal: c.PriceOriginal,
		}, ch)
		if res.Score <= 0 {
			continue
		}
		c.Score = res.Score
		out = append(out, c)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}
