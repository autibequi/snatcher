package match

import (
	"math"
	"strings"

	"snatcher/backendv2/internal/models"
)

// defaultWeights define os pesos padrão para composição do score.
var defaultWeights = Weights{
	Category: 0.30,
	Brand:    0.20,
	Drop:     0.20,
	Price:    0.15,
	History:  0.15,
}

// Weights permite customizar a composição do score.
type Weights struct {
	Category float64
	Brand    float64
	Drop     float64
	Price    float64
	History  float64
}

// Score representa o resultado de match para um canal.
type Score struct {
	ChannelID   int64    `json:"channel_id"`
	ChannelName string   `json:"channel_name"`
	Value       float64  `json:"score"`   // 0..100
	Reasons     []string `json:"reasons"`
}

// ProductInput agrupa os dados do produto usados no scoring.
type ProductInput struct {
	Category string
	Brand    string
	Price    float64
	Drop     float64 // percentual: 18 = 18%
}

// ScoreChannel calcula o score de afinidade entre produto e canal.
// Função pura: sem IO, sem DB, testável isoladamente.
func ScoreChannel(product ProductInput, channel models.Channel, w Weights) Score {
	// Garantir que Audience está desserializada a partir de AudienceRaw quando necessário.
	ch := channel
	if len(ch.AudienceRaw) > 0 {
		_ = ch.UnmarshalAudience()
	}
	aud := ch.Audience

	score := Score{ChannelID: ch.ID, ChannelName: ch.Name}

	var total float64
	var reasons []string

	// Componente: category_match
	catScore := 0.0
	if len(aud.Categories) == 0 || product.Category == "" {
		catScore = 0.5 // sem filtro = neutro
	} else {
		for _, c := range aud.Categories {
			if strings.EqualFold(c, product.Category) {
				catScore = 1.0
				reasons = append(reasons, "categoria match")
				break
			}
		}
	}
	total += catScore * w.Category

	// Componente: brand_match
	brandScore := 0.3 // default quando audience não filtra por brand
	if len(aud.Brands) > 0 && product.Brand != "" {
		brandScore = 0.0
		for _, b := range aud.Brands {
			if strings.EqualFold(b, product.Brand) {
				brandScore = 1.0
				reasons = append(reasons, "marca presente no perfil")
				break
			}
		}
	}
	total += brandScore * w.Brand

	// Componente: drop_above_min
	dropScore := 0.0
	if aud.MinDrop <= 0 {
		dropScore = 1.0 // sem filtro de drop
	} else if product.Drop >= aud.MinDrop {
		dropScore = 1.0
		reasons = append(reasons, "drop acima do mínimo")
	} else if product.Drop > 0 {
		// ramp linear até min_drop
		dropScore = product.Drop / aud.MinDrop
	}
	total += dropScore * w.Drop

	// Componente: price_in_band
	priceScore := 0.0
	if aud.MinPrice <= 0 && aud.MaxPrice <= 0 {
		priceScore = 1.0 // sem filtro
	} else {
		minP := aud.MinPrice
		maxP := aud.MaxPrice
		if maxP <= 0 {
			maxP = math.MaxFloat64
		}
		if product.Price >= minP && product.Price <= maxP {
			priceScore = 1.0
			reasons = append(reasons, "ticket dentro da faixa")
		} else if product.Price < minP && minP > 0 {
			priceScore = math.Max(0, 1.0-(minP-product.Price)/minP)
		} else if maxP < math.MaxFloat64 {
			priceScore = math.Max(0, 1.0-(product.Price-maxP)/maxP)
		}
	}
	total += priceScore * w.Price

	// Componente: history_weight — placeholder (0.5 neutro sem histórico)
	histScore := 0.5
	total += histScore * w.History

	score.Value = math.Round(total * 100) // 0..100
	score.Reasons = reasons
	return score
}

// RankChannels calcula scores para uma lista de canais e ordena por score desc.
// Retorna no máximo 50 resultados com score > 0.
func RankChannels(product ProductInput, channels []models.Channel) []Score {
	scores := make([]Score, 0, len(channels))
	for _, ch := range channels {
		s := ScoreChannel(product, ch, defaultWeights)
		if s.Value > 0 {
			scores = append(scores, s)
		}
	}
	// ordenação bubble sort desc (lista tipicamente pequena < 1000)
	for i := 0; i < len(scores)-1; i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].Value > scores[i].Value {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}
	if len(scores) > 50 {
		scores = scores[:50]
	}
	return scores
}
