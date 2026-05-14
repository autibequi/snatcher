package spy

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/services/prompts"
)

// ParsedMessage é o resultado do parse de uma mensagem de grupo spy.
type ParsedMessage struct {
	RawText string
	Links   []string
	Prices  []float64
}

// ProductCandidate é um candidato a produto extraído de mensagem.
type ProductCandidate struct {
	Title       string
	URL         string
	Marketplace string
	Price       float64
	PriceOrig   float64
	DropPct     float64
	IsOffer     bool
	SourceRaw   string
}

// Regex patterns para marketplaces brasileiros
var marketplacePatterns = []*regexp.Regexp{
	regexp.MustCompile(`https?://(?:www\.)?a\.co/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?amazon\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?amzn\.to/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?mercadolivre\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?produto\.mercadolivre\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?magazineluiza\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?shopee\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?s\.shopee\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?aliexpress\.com/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?casasbahia\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?kabum\.com\.br/[^\s]+`),
	regexp.MustCompile(`https?://(?:www\.)?americanas\.com\.br/[^\s]+`),
}

var pricePattern = regexp.MustCompile(`R\$\s*([\d.]+[,]\d{2})`)

// ParseLinks extrai URLs de marketplaces de uma mensagem.
func ParseLinks(text string) []string {
	var links []string
	for _, pat := range marketplacePatterns {
		found := pat.FindAllString(text, -1)
		links = append(links, found...)
	}
	return links
}

// ParsePrices extrai preços em BRL de uma mensagem.
func ParsePrices(text string) []float64 {
	var prices []float64
	for _, m := range pricePattern.FindAllStringSubmatch(text, -1) {
		raw := strings.ReplaceAll(m[1], ".", "")
		raw = strings.ReplaceAll(raw, ",", ".")
		var v float64
		if _, err := fmt.Sscanf(raw, "%f", &v); err == nil {
			prices = append(prices, v)
		}
	}
	return prices
}

// Parse parseia uma mensagem bruta.
func Parse(raw string) ParsedMessage {
	return ParsedMessage{
		RawText: raw,
		Links:   ParseLinks(raw),
		Prices:  ParsePrices(raw),
	}
}

// Parser converte mensagens em ProductCandidate com regex + LLM fallback.
type Parser struct {
	llmCli   llm.Client
	registry *prompts.Registry
	cache    map[string]ProductCandidate // in-memory cache por hash de mensagem
}

// NewParser cria um Parser. llmCli pode ser nil (desabilita fallback LLM).
func NewParser(llmCli llm.Client) *Parser {
	return &Parser{
		llmCli:   llmCli,
		registry: prompts.NewRegistry(),
		cache:    make(map[string]ProductCandidate),
	}
}

// ToCandidate tenta extrair um ProductCandidate de uma mensagem.
// Usa regex primeiro; fallback LLM se nenhum produto detectado.
func (p *Parser) ToCandidate(ctx context.Context, raw string) (ProductCandidate, bool) {
	parsed := Parse(raw)

	// Cache por hash da mensagem
	h := fmt.Sprintf("%x", sha256.Sum256([]byte(raw)))
	if cached, ok := p.cache[h]; ok {
		return cached, cached.IsOffer
	}

	// Tentar extrair via regex
	if len(parsed.Links) > 0 {
		cand := ProductCandidate{
			URL:       parsed.Links[0],
			IsOffer:   len(parsed.Prices) > 0,
			SourceRaw: raw,
		}
		if len(parsed.Prices) > 0 {
			cand.Price = parsed.Prices[0]
		}
		if len(parsed.Prices) > 1 {
			cand.PriceOrig = parsed.Prices[1]
			if cand.Price < cand.PriceOrig {
				cand.DropPct = (1 - cand.Price/cand.PriceOrig) * 100
			}
		}
		cand.Marketplace = detectMarketplace(cand.URL)
		p.cache[h] = cand
		return cand, cand.IsOffer
	}

	// Fallback LLM se há indicios de oferta mas sem link detectado
	if len(parsed.Prices) == 0 || p.llmCli == nil {
		return ProductCandidate{}, false
	}

	cand := p.llmFallback(ctx, parsed)
	p.cache[h] = cand
	return cand, cand.IsOffer
}

func (p *Parser) llmFallback(ctx context.Context, parsed ParsedMessage) ProductCandidate {
	prompt, err := p.registry.Active("parse_offer")
	if err != nil {
		return ProductCandidate{}
	}

	type renderData struct {
		RawMessage string
		Links      []string
	}
	rendered, err := prompt.Render(renderData{RawMessage: parsed.RawText, Links: parsed.Links})
	if err != nil {
		return ProductCandidate{}
	}

	resp, err := p.llmCli.Complete(ctx, rendered, llm.Options{
		Operation:   "parse_offer",
		MaxTokens:   prompt.MaxTokens,
		Temperature: prompt.Temperature,
	})
	if err != nil {
		return ProductCandidate{}
	}

	// Limpar markdown code fences se o modelo devolver
	resp = strings.TrimSpace(resp)
	resp = strings.TrimPrefix(resp, "```json")
	resp = strings.TrimPrefix(resp, "```")
	resp = strings.TrimSuffix(resp, "```")
	resp = strings.TrimSpace(resp)

	var result struct {
		IsOffer     bool     `json:"is_offer"`
		Title       string   `json:"title"`
		Marketplace string   `json:"marketplace"`
		Price       float64  `json:"price_current"`
		PriceOrig   *float64 `json:"price_original"`
		DropPct     *float64 `json:"drop_pct"`
		URL         string   `json:"url"`
	}
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		return ProductCandidate{}
	}
	cand := ProductCandidate{
		IsOffer:     result.IsOffer,
		Title:       result.Title,
		Marketplace: result.Marketplace,
		Price:       result.Price,
		URL:         result.URL,
		SourceRaw:   parsed.RawText,
	}
	if result.PriceOrig != nil {
		cand.PriceOrig = *result.PriceOrig
	}
	if result.DropPct != nil {
		cand.DropPct = *result.DropPct
	}
	return cand
}

func detectMarketplace(url string) string {
	lower := strings.ToLower(url)
	switch {
	case strings.Contains(lower, "amazon"), strings.Contains(lower, "amzn"):
		return "amazon"
	case strings.Contains(lower, "mercadolivre"), strings.Contains(lower, "mlc.li"):
		return "mercadolivre"
	case strings.Contains(lower, "magazineluiza"), strings.Contains(lower, "magalu"):
		return "magalu"
	case strings.Contains(lower, "shopee"):
		return "shopee"
	case strings.Contains(lower, "aliexpress"):
		return "aliexpress"
	case strings.Contains(lower, "casasbahia"):
		return "casasbahia"
	case strings.Contains(lower, "kabum"):
		return "kabum"
	case strings.Contains(lower, "americanas"):
		return "americanas"
	default:
		return "unknown"
	}
}
