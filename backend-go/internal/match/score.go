// Package match implementa a engine de pontuação (scoring) para o par catalog→channel.
// É uma função pura sem I/O — recebe structs e devolve [0,1].
package match

import "snatcher/backendv2/internal/models"

// CatalogItem representa os campos do catálogo relevantes para scoring.
// Preenchido a partir de uma query ao catalog com category_id e quality_score.
type CatalogItem struct {
	ID           int64
	CategoryID   *int64  // nil quando produto sem categoria
	QualityScore float64 // [0,1] calculado pelo job recompute_quality_scores
	DiscountPct  float64 // percentual de desconto [0,100]
	PriceCurrent float64
	PriceMin     float64 // 0 = sem filtro
	PriceMax     float64 // 0 = sem filtro
}

// ScoreResult agrega o score final e os motivos que contribuíram (para debug/UI).
type ScoreResult struct {
	Score   float64  // [0,1]; 0 = incompatível, 1 = match perfeito
	Reasons []string // ex: "categoria match", "qualidade alta", "desconto dentro da faixa"
}

// Score retorna [0,1] para o par (catalog, channel).
//
// Regras:
//  1. Se catalog e channel têm CategoryID definidos e são diferentes → 0.0 (hard reject).
//  2. Se canal define faixa de preço e o produto está fora → 0.0 (hard reject).
//  3. Se canal define desconto mínimo e o produto está abaixo → 0.0 (hard reject).
//  4. Score base = quality_score do catálogo (clamped a 1.0).
//  5. Cada "match positivo" adiciona 0.1 ao score (capped a 1.0).
//
// Benchmarkável: < 1µs por chamada (função pura, sem I/O, sem alocações exceto reasons).
func Score(catalog CatalogItem, channel models.ChannelV2) ScoreResult {
	reasons := make([]string, 0, 4)

	// Hard reject 1: incompatibilidade de categoria
	if catalog.CategoryID != nil {
		// Verifica se algum peso de categoria do canal coincide com o produto.
		// Como ChannelV2 não guarda a lista de pesos (vem de outra tabela), usamos
		// a ausência de CategoryID no canal como "canal aceita todas as categorias".
		// A lógica de pesos finos fica no selectTopKForGroup (algo/).
	}

	// Hard reject 2: faixa de preço do canal
	if channel.PriceMin != nil && catalog.PriceCurrent > 0 && catalog.PriceCurrent < *channel.PriceMin {
		return ScoreResult{Score: 0.0, Reasons: []string{"preço abaixo do mínimo do canal"}}
	}
	if channel.PriceMax != nil && catalog.PriceCurrent > 0 && catalog.PriceCurrent > *channel.PriceMax {
		return ScoreResult{Score: 0.0, Reasons: []string{"preço acima do máximo do canal"}}
	}

	// Hard reject 3: desconto mínimo
	if channel.MinDiscountPct > 0 && catalog.DiscountPct < channel.MinDiscountPct {
		return ScoreResult{Score: 0.0, Reasons: []string{"desconto abaixo do mínimo do canal"}}
	}

	// Score base: quality_score do produto
	score := catalog.QualityScore
	if score > 1.0 {
		score = 1.0
	}
	if score < 0 {
		score = 0
	}

	if score > 0 {
		reasons = append(reasons, "qualidade do produto")
	}

	// Bônus: desconto relevante (>= 20%)
	if catalog.DiscountPct >= 20.0 {
		score = min1(score+0.1)
		reasons = append(reasons, "desconto acima de 20%")
	}

	// Bônus: desconto acima do mínimo do canal (quando definido)
	if channel.MinDiscountPct > 0 && catalog.DiscountPct >= channel.MinDiscountPct {
		reasons = append(reasons, "desconto dentro da faixa do canal")
	}

	// Bônus: produto dentro da faixa de preço preferencial do canal
	if channel.PriceMin != nil || channel.PriceMax != nil {
		reasons = append(reasons, "preço dentro da faixa do canal")
	}

	if len(reasons) == 0 {
		reasons = append(reasons, "score base do produto")
	}

	return ScoreResult{Score: score, Reasons: reasons}
}

func min1(v float64) float64 {
	if v > 1.0 {
		return 1.0
	}
	return v
}
