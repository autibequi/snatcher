package match

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
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

// ScoreBreakdown detalha a composição do score por componente.
type ScoreBreakdown struct {
	Category          float64            `json:"category"`
	Subcategory       float64            `json:"subcategory"`
	Brand             float64            `json:"brand"`
	Attribute         float64            `json:"attribute"`
	Price             float64            `json:"price"`
	Drop              float64            `json:"drop"`
	History           float64            `json:"history"`
	HardFiltersPassed bool               `json:"hard_filters_passed"`
	WeightsUsed       map[string]float64 `json:"weights_used"`
}

// ScoreResult contém o score total e seu breakdown detalhado.
type ScoreResult struct {
	ChannelID   int64          `json:"channel_id"`
	ChannelName string         `json:"channel_name"`
	Total       int            `json:"total"`       // 0..100
	Breakdown   ScoreBreakdown `json:"breakdown"`
	Reasons     []string       `json:"reasons"`
}

// ProductInput agrupa os dados do produto usados no scoring.
type ProductInput struct {
	Name     string  // título completo — usado para match parcial
	Category string
	Brand    string
	Price    float64
	Drop     float64 // percentual: 18 = 18%
}

// ScoreChannel calcula o score de afinidade entre produto e canal (backward compat).
// Wrapper que chama ScoreChannelDetailed e retorna apenas o valor.
func ScoreChannel(product ProductInput, channel models.Channel, w Weights) Score {
	result := ScoreChannelDetailed(product, channel, nil, nil, 0, w)
	return Score{
		ChannelID:   result.ChannelID,
		ChannelName: result.ChannelName,
		Value:       float64(result.Total),
		Reasons:     result.Reasons,
	}
}

// ScoreChannelDetailed calcula score com breakdown detalhado, hard filters, e taxonomias.
// productTaxonomies: lista de taxonomias do produto (role='primary_category', 'subcategory', 'brand', 'attribute_*')
// productAttrs: mapa de atributo → IDs. Ex: {"color": [1,2], "size": [3]} (pode ser nil)
// clicksLast30d: número de cliques desse canal nos últimos 30 dias
func ScoreChannelDetailed(product ProductInput, channel models.Channel, productTaxonomies []models.CatalogProductTaxonomy, productAttrs map[string][]int64, clicksLast30d int, w Weights) ScoreResult {
	// Garantir que Audience está desserializada
	ch := channel
	if len(ch.AudienceRaw) > 0 {
		_ = ch.UnmarshalAudience()
	}
	aud := ch.Audience

	result := ScoreResult{
		Total:     0,
		Breakdown: ScoreBreakdown{HardFiltersPassed: true},
		Reasons:   []string{},
	}

	// 1. HARD FILTERS
	// Verifica exclude_category_ids
	if len(aud.ExcludeCategoryIDs) > 0 && productTaxonomies != nil {
		for _, pt := range productTaxonomies {
			if pt.Role == "primary_category" {
				for _, excludeID := range aud.ExcludeCategoryIDs {
					if pt.TaxonomyID == excludeID {
						result.Breakdown.HardFiltersPassed = false
						result.Reasons = append(result.Reasons, "EXCLUÍDO: categoria está na lista de exclusão")
						return result
					}
				}
			}
		}
	}

	// Verifica exclude_brand_ids
	if len(aud.ExcludeBrandIDs) > 0 && productTaxonomies != nil {
		for _, pt := range productTaxonomies {
			if pt.Role == "brand" {
				for _, excludeID := range aud.ExcludeBrandIDs {
					if pt.TaxonomyID == excludeID {
						result.Breakdown.HardFiltersPassed = false
						result.Reasons = append(result.Reasons, "EXCLUÍDO: marca está na lista de exclusão")
						return result
					}
				}
			}
		}
	}

	// Verifica required_attributes (todas as chaves precisam ter ≥1 ID em comum)
	if len(aud.RequiredAttributes) > 0 && productAttrs != nil {
		for attrKey := range aud.RequiredAttributes {
			requiredIDs := aud.RequiredAttributes[attrKey]
			productIDs := productAttrs[attrKey]
			hasCommon := false
			for _, reqID := range requiredIDs {
				for _, prodID := range productIDs {
					if reqID == prodID {
						hasCommon = true
						break
					}
				}
				if hasCommon {
					break
				}
			}
			if !hasCommon {
				result.Breakdown.HardFiltersPassed = false
				result.Reasons = append(result.Reasons, "FALHOU: atributo requerido "+attrKey+" não satisfeito")
				return result
			}
		}
	}

	// Se hard filters falharam, return 0
	if !result.Breakdown.HardFiltersPassed {
		result.Total = 0
		return result
	}

	// 2. SOFT COMPONENTS (cada um 0.0-1.0)
	var total float64
	weights := w
	if weights.Category == 0 && weights.Brand == 0 && weights.Price == 0 {
		weights = defaultWeights
	}

	// Pesar default: subcategory + attribute não estavam na versão anterior
	if weights.Category+weights.Brand+weights.Price+weights.Drop+weights.History > 0.01 {
		// Normalizar pesos existentes para acomodar novos componentes
		sum := weights.Category + weights.Brand + weights.Price + weights.Drop + weights.History
		weights.Category = weights.Category * 0.85 / sum
		weights.Brand = weights.Brand * 0.85 / sum
		weights.Price = weights.Price * 0.85 / sum
		weights.Drop = weights.Drop * 0.85 / sum
		weights.History = weights.History * 0.85 / sum
	} else {
		weights = Weights{
			Category:    0.25,
			Brand:       0.15,
			Price:       0.10,
			Drop:        0.10,
			History:     0.10,
		}
	}

	// Novo: subcategory (0.15) + attribute (0.15) em espaço de pesos
	subcatWeight := 0.15
	attrWeight := 0.15

	// Category: hit em IncludeCategoryIDs → 1.0
	catScore := 0.0
	if len(aud.IncludeCategoryIDs) == 0 {
		catScore = 0.5 // sem filtro = neutro
		result.Reasons = append(result.Reasons, "categoria: sem filtro aplicado")
	} else if productTaxonomies != nil {
		for _, pt := range productTaxonomies {
			if pt.Role == "primary_category" {
				for _, includeID := range aud.IncludeCategoryIDs {
					if pt.TaxonomyID == includeID {
						catScore = 1.0
						result.Reasons = append(result.Reasons, "categoria: match em inclusos")
						break
					}
				}
			}
			if catScore > 0.5 {
				break
			}
		}
	} else {
		// Fallback para compat: usar string matching na categoria e nome
		matchInProduct := func(keyword string) bool {
			if containsKeyword(product.Category, keyword) {
				return true
			}
			if containsKeyword(product.Name, keyword) {
				return true
			}
			if containsKeyword(product.Brand, keyword) {
				return true
			}
			return false
		}
		if len(aud.Categories) == 0 {
			catScore = 0.5
		} else {
			for _, c := range aud.Categories {
				if matchInProduct(c) {
					catScore = 1.0
					result.Reasons = append(result.Reasons, "categoria: match por keyword")
					break
				}
			}
		}
	}
	result.Breakdown.Category = catScore
	total += catScore * weights.Category

	// Subcategory: hit em IncludeSubcategoryIDs → 1.0
	subcatScore := 0.0
	if len(aud.IncludeSubcategoryIDs) == 0 {
		subcatScore = 0.5 // sem filtro = neutro
		result.Reasons = append(result.Reasons, "subcategoria: sem filtro")
	} else if productTaxonomies != nil {
		for _, pt := range productTaxonomies {
			if pt.Role == "subcategory" {
				for _, includeID := range aud.IncludeSubcategoryIDs {
					if pt.TaxonomyID == includeID {
						subcatScore = 1.0
						result.Reasons = append(result.Reasons, "subcategoria: match")
						break
					}
				}
			}
			if subcatScore > 0.5 {
				break
			}
		}
	}
	if subcatScore == 0.0 && len(aud.IncludeSubcategoryIDs) > 0 {
		// Não bateu nas includes, fica com 0
		subcatScore = 0.0
		if !containsString(result.Reasons, "subcategoria") {
			result.Reasons = append(result.Reasons, "subcategoria: sem match")
		}
	}
	result.Breakdown.Subcategory = subcatScore
	total += subcatScore * subcatWeight

	// Brand: hit em IncludeBrandIDs → 1.0, senão 0.3
	brandScore := 0.3 // default quando não filtra
	if len(aud.IncludeBrandIDs) > 0 {
		brandScore = 0.0
		if productTaxonomies != nil {
			for _, pt := range productTaxonomies {
				if pt.Role == "brand" {
					for _, includeID := range aud.IncludeBrandIDs {
						if pt.TaxonomyID == includeID {
							brandScore = 1.0
							result.Reasons = append(result.Reasons, "marca: match em inclusos")
							break
						}
					}
				}
				if brandScore > 0.3 {
					break
				}
			}
		} else {
			// Fallback
			matchInProduct := func(keyword string) bool {
				return containsKeyword(product.Brand, keyword) || containsKeyword(product.Name, keyword)
			}
			for _, b := range aud.Brands {
				if matchInProduct(b) {
					brandScore = 1.0
					result.Reasons = append(result.Reasons, "marca: match por keyword")
					break
				}
			}
		}
	} else if len(aud.Brands) > 0 {
		// Compat com versão antiga: filtro por string
		brandScore = 0.0
		matchInProduct := func(keyword string) bool {
			return containsKeyword(product.Brand, keyword) || containsKeyword(product.Name, keyword)
		}
		for _, b := range aud.Brands {
			if matchInProduct(b) {
				brandScore = 1.0
				result.Reasons = append(result.Reasons, "marca: match por keyword (compat)")
				break
			}
		}
	}
	result.Breakdown.Brand = brandScore
	total += brandScore * weights.Brand

	// Attribute: proporção de PreferredAttributes satisfeitos
	attrScore := 0.0
	if len(aud.PreferredAttributes) == 0 {
		attrScore = 0.5 // sem preferências = neutro
		result.Reasons = append(result.Reasons, "atributos: sem preferências")
	} else if productAttrs != nil {
		satisfied := 0
		for attrKey := range aud.PreferredAttributes {
			preferredIDs := aud.PreferredAttributes[attrKey]
			productIDs := productAttrs[attrKey]
			for _, prefID := range preferredIDs {
				for _, prodID := range productIDs {
					if prefID == prodID {
						satisfied++
						break
					}
				}
			}
		}
		if len(aud.PreferredAttributes) > 0 {
			attrScore = float64(satisfied) / float64(len(aud.PreferredAttributes))
			result.Reasons = append(result.Reasons, "atributos: "+strings.Join(getAttrNames(aud.PreferredAttributes), ", ")+" ("+intToString(satisfied)+"/"+intToString(len(aud.PreferredAttributes))+")")
		}
	}
	result.Breakdown.Attribute = attrScore
	total += attrScore * attrWeight

	// Price: dentro de [MinPrice, MaxPrice] → 1.0; decay linear nas bordas
	priceScore := 0.0
	if aud.MinPrice <= 0 && aud.MaxPrice <= 0 {
		priceScore = 1.0
		result.Reasons = append(result.Reasons, "preço: sem filtro")
	} else {
		minP := aud.MinPrice
		maxP := aud.MaxPrice
		if maxP <= 0 {
			maxP = math.MaxFloat64
		}
		if product.Price >= minP && product.Price <= maxP {
			priceScore = 1.0
			result.Reasons = append(result.Reasons, "preço: dentro da faixa")
		} else if product.Price < minP && minP > 0 {
			priceScore = math.Max(0, 1.0-(minP-product.Price)/minP)
			result.Reasons = append(result.Reasons, "preço: abaixo da faixa (decay)")
		} else if maxP < math.MaxFloat64 && product.Price > maxP {
			priceScore = math.Max(0, 1.0-(product.Price-maxP)/maxP)
			result.Reasons = append(result.Reasons, "preço: acima da faixa (decay)")
		}
	}
	result.Breakdown.Price = priceScore
	total += priceScore * weights.Price

	// Drop: drop ≥ MinDrop → 1.0; ramp linear
	dropScore := 0.0
	if aud.MinDrop <= 0 {
		dropScore = 1.0
		result.Reasons = append(result.Reasons, "desconto: sem mínimo")
	} else if product.Drop >= aud.MinDrop {
		dropScore = 1.0
		result.Reasons = append(result.Reasons, "desconto: acima do mínimo")
	} else if product.Drop > 0 {
		dropScore = product.Drop / aud.MinDrop
		result.Reasons = append(result.Reasons, "desconto: abaixo do mínimo (ramp)")
	}
	result.Breakdown.Drop = dropScore
	total += dropScore * weights.Drop

	// History: cliques nos últimos 30 dias, normalized com cap em 10 → 1.0
	histScore := math.Min(float64(clicksLast30d)/10.0, 1.0)
	if clicksLast30d > 0 {
		result.Reasons = append(result.Reasons, fmt.Sprintf("histórico: %d cliques últimos 30d (score=%.2f)", clicksLast30d, histScore))
	} else {
		result.Reasons = append(result.Reasons, "histórico: sem cliques nos últimos 30 dias")
	}
	result.Breakdown.History = histScore
	total += histScore * weights.History

	// 3. TOTAL = round((Σ component × weight) × 100)
	result.Total = int(math.Round(total * 100))
	if result.Total < 0 {
		result.Total = 0
	}
	if result.Total > 100 {
		result.Total = 100
	}

	// Preencher pesos usados
	result.Breakdown.WeightsUsed = map[string]float64{
		"category":    weights.Category,
		"subcategory": subcatWeight,
		"brand":       weights.Brand,
		"attribute":   attrWeight,
		"price":       weights.Price,
		"drop":        weights.Drop,
		"history":     weights.History,
	}

	return result
}

// Helper: verifica se string está em array
func containsString(arr []string, s string) bool {
	for _, v := range arr {
		if v == s {
			return true
		}
	}
	return false
}

// Helper: converte int para string
func intToString(i int) string {
	return strconv.Itoa(i)
}

// Helper: extrai nomes de atributos
func getAttrNames(attrs map[string][]int64) []string {
	names := make([]string, 0, len(attrs))
	for k := range attrs {
		names = append(names, k)
	}
	return names
}

// MatchesChannelFilter verifica se um produto passa pelos filtros de match_type/match_value/max_price
// configurados na automação do canal. maxPrice 0 = sem limite.
// Tipos suportados: all, category, brand, keyword, regex, word_boundary, attribute_strict, attribute_any
func MatchesChannelFilter(inp ProductInput, productPrice float64, matchType, matchValue string, maxPrice float64) bool {
	if matchType != "all" && matchValue != "" {
		switch matchType {
		case "category":
			if !containsKeyword(inp.Category, matchValue) && !containsKeyword(inp.Name, matchValue) {
				return false
			}
		case "brand":
			if !containsKeyword(inp.Brand, matchValue) {
				return false
			}
		case "keyword":
			if !containsKeyword(inp.Name, matchValue) {
				return false
			}
		case "regex":
			// Compila regex com flag case-insensitive (?i)
			rgx, err := regexp.Compile("(?i)" + matchValue)
			if err != nil {
				// Regex inválido = não match
				return false
			}
			// Testa contra nome canônico
			if !rgx.MatchString(inp.Name) {
				return false
			}
		case "word_boundary":
			// Match word boundary case-insensitive: (?i)\bVALUE\b
			if !matchesWordBoundary(inp.Name, matchValue) {
				return false
			}
		case "attribute_strict":
			// matchValue é JSON {"color":["preto"], "size":["G"]}
			// Todos os atributos precisam bater. Por enquanto é TODO — productAttrs não está disponível aqui
			// Retorna true (skip este filtro) como placeholder
			return true
		case "attribute_any":
			// idem, qualquer um basta. TODO por enquanto
			return true
		}
	}
	if maxPrice > 0 && productPrice > maxPrice {
		return false
	}
	return true
}

// matchesWordBoundary verifica se value bate como word boundary em text (case-insensitive)
func matchesWordBoundary(text, value string) bool {
	if value == "" {
		return false
	}
	rgx, err := regexp.Compile("(?i)\\b" + regexp.QuoteMeta(value) + "\\b")
	if err != nil {
		return false
	}
	return rgx.MatchString(text)
}

// resolveWeights retorna pesos do canal se algum estiver definido, caso contrário usa default.
func resolveWeights(ch models.Channel) Weights {
	w := ch.Audience.Weights
	sum := w.Category + w.Brand + w.Drop + w.Price + w.History
	if sum <= 0 {
		return defaultWeights
	}
	return Weights{
		Category: w.Category,
		Brand:    w.Brand,
		Drop:     w.Drop,
		Price:    w.Price,
		History:  w.History,
	}
}

// RankChannels calcula scores para uma lista de canais e ordena por score desc.
// Retorna no máximo 50 resultados com score > 0.
func RankChannels(product ProductInput, channels []models.Channel) []Score {
	scores := make([]Score, 0, len(channels))
	for _, ch := range channels {
		// Garante que Audience está desserializada antes de resolver pesos
		c := ch
		if len(c.AudienceRaw) > 0 {
			_ = c.UnmarshalAudience()
		}
		s := ScoreChannel(product, c, resolveWeights(c))
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
		if !g.ChannelID.Valid {
			continue
		}
		ch, ok := channelByID[g.ChannelID.Int64]
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
