package match

import (
	"math"
	"strings"
	"unicode"

	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
	"snatcher/backendv2/internal/models"
)

// normalize converte string para minúsculo sem acentos para comparação robusta.
func normalize(s string) string {
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r) // remove combining marks (acentos)
	}), norm.NFC)
	result, _, err := transform.String(t, strings.ToLower(s))
	if err != nil {
		return strings.ToLower(s)
	}
	return result
}

// containsKeyword verifica se keyword aparece em text (normalizado, sem acento).
func containsKeyword(text, keyword string) bool {
	t := normalize(text)
	k := normalize(keyword)
	if k == "" {
		return false
	}
	return strings.Contains(t, k)
}

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
	Name     string  // título completo — usado para match parcial
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

	// matchInProduct verifica se keyword bate na categoria, nome ou brand do produto (parcial + normalizado)
	matchInProduct := func(keyword string) bool {
		if containsKeyword(product.Category, keyword) { return true }
		if containsKeyword(product.Name, keyword) { return true }
		if containsKeyword(product.Brand, keyword) { return true }
		return false
	}

	// Componente: category_match — parcial no título/categoria/marca
	catScore := 0.0
	if len(aud.Categories) == 0 {
		catScore = 0.5 // sem filtro = neutro
	} else {
		for _, c := range aud.Categories {
			if matchInProduct(c) {
				catScore = 1.0
				reasons = append(reasons, "categoria match")
				break
			}
		}
	}
	total += catScore * w.Category

	// Componente: brand_match — parcial no título/marca
	brandScore := 0.3 // default quando audience não filtra por brand
	if len(aud.Brands) > 0 {
		brandScore = 0.0
		for _, b := range aud.Brands {
			if matchInProduct(b) {
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

// GroupScore representa o resultado de match para um grupo físico (WA/TG) dentro de um canal.
type GroupScore struct {
	GroupID   int64    `json:"group_id"`
	GroupName string   `json:"group_name"`
	ChannelID int64    `json:"channel_id"`
	ChannelName string  `json:"channel_name"`
	Subcategory string  `json:"subcategory,omitempty"`
	Score     int      `json:"score"`
	Reasons   []string `json:"reasons"`
	MissingReasons []string `json:"missing_reasons,omitempty"`
	// Campos enriquecidos (be-03)
	MembersCount      int      `json:"members_count"`
	ChannelCTR        float64  `json:"channel_ctr"`
	HistoricalCTRHere *float64 `json:"historical_ctr_here,omitempty"` // null se < 5 dispatches
	DiscountThreshold float64  `json:"discount_threshold,omitempty"`
}

// ScoreGroup calcula o score de afinidade entre produto e grupo usando o canal pai.
// Função pura: sem IO. O enriquecimento de campos extras (HistoricalCTRHere, etc.)
// é responsabilidade do caller (handler).
func ScoreGroup(product ProductInput, group models.RedesignGroup, channel models.Channel, w Weights) GroupScore {
	// Aproveitar ScoreChannel para calcular o score baseado na audience do canal.
	chanScore := ScoreChannel(product, channel, w)

	// Subcategoria: primeiro elemento das categories da audience do canal.
	subcategory := ""
	if len(channel.Audience.Categories) > 0 {
		subcategory = channel.Audience.Categories[0]
	}

	// MissingReasons: componentes sem razão de match explícita.
	var missing []string
	if len(channel.Audience.Categories) > 0 {
		hasCat := false
		for _, r := range chanScore.Reasons {
			if r == "categoria match" {
				hasCat = true
				break
			}
		}
		if !hasCat {
			missing = append(missing, "sem match de categoria")
		}
	}
	if len(channel.Audience.Brands) > 0 {
		hasBrand := false
		for _, r := range chanScore.Reasons {
			if r == "marca presente no perfil" {
				hasBrand = true
				break
			}
		}
		if !hasBrand {
			missing = append(missing, "sem match de marca")
		}
	}

	gs := GroupScore{
		GroupID:     group.ID,
		GroupName:   group.Name,
		ChannelID:   channel.ID,
		ChannelName: channel.Name,
		Subcategory: subcategory,
		Score:       int(chanScore.Value),
		Reasons:     chanScore.Reasons,
		MissingReasons: missing,
		// Campos enriquecidos preenchidos pelo handler após a chamada.
		MembersCount: int(group.MemberCount),
		ChannelCTR:   channel.CTR30d,
		// TODO: DiscountThreshold — aguarda coluna groups.min_drop ou groups.discount_threshold no schema.
		// Por ora usa channel.Audience.MinDrop como proxy do limiar de desconto do canal.
		DiscountThreshold: channel.Audience.MinDrop,
	}
	return gs
}

// RankGroups calcula scores para grupos físicos (tabela groups) de canais ativos
// e retorna os top 50 ordenados por score desc.
// channelByID é um mapa channel_id → Channel para lookup O(1).
func RankGroups(product ProductInput, groups []models.RedesignGroup, channelByID map[int64]models.Channel) []GroupScore {
	scores := make([]GroupScore, 0, len(groups))
	for _, g := range groups {
		if g.Status != "active" {
			continue
		}
		ch, ok := channelByID[g.ChannelID]
		if !ok {
			continue
		}
		gs := ScoreGroup(product, g, ch, defaultWeights)
		if gs.Score > 0 {
			scores = append(scores, gs)
		}
	}
	// ordenação bubble sort desc
	for i := 0; i < len(scores)-1; i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].Score > scores[i].Score {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}
	if len(scores) > 50 {
		scores = scores[:50]
	}
	return scores
}
