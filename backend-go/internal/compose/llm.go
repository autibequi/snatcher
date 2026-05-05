package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/prompts"
)

// Suggestion é a resposta gerada pelo LLM para copy de disparo.
type Suggestion struct {
	Text            string   `json:"text"`
	Hashtags        []string `json:"hashtags"`
	EmojiSet        []string `json:"emoji_set"`
	MediaSuggestion string   `json:"media_suggestion"`
	Cached          bool     `json:"cached"`
}

// ProductInput agrega os dados necessários para gerar o prompt.
type ProductInput struct {
	Title       string
	Marketplace string
	Price       float64
	PriceOrig   float64
	Drop        float64
	Category    string
	Brand       string
}

// Service encapsula a lógica de geração de copy via LLM.
type Service struct {
	cli      llm.Client
	registry *prompts.Registry
}

// NewService cria um Service com o llm.Client injetado.
// Passar um llm.CachedClient garante TTL 1h via cache Postgres.
func NewService(cli llm.Client) *Service {
	return &Service{
		cli:      cli,
		registry: prompts.NewRegistry(),
	}
}

// NewServiceWithRegistry cria um Service com llm.Client e Registry externos (útil em testes).
func NewServiceWithRegistry(cli llm.Client, reg *prompts.Registry) *Service {
	return &Service{cli: cli, registry: reg}
}

// Preview gera copy de disparo para um produto + canal opcional.
//
// Usa o prompt registry para renderizar o prompt "compose" ativo.
// Timeout interno de 8s; em caso de falha retorna fallback humano sem error.
func (s *Service) Preview(ctx context.Context, product ProductInput, channel *models.Channel) (Suggestion, error) {
	p, err := s.registry.Active("compose")
	if err != nil {
		return s.fallback(product), nil
	}

	type renderData struct {
		Product ProductInput
		Channel *models.Channel
	}
	rendered, err := p.Render(renderData{Product: product, Channel: channel})
	if err != nil {
		return s.fallback(product), nil
	}

	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	opts := llm.Options{
		Operation:   "compose",
		MaxTokens:   p.MaxTokens,
		Temperature: p.Temperature,
	}
	if p.Model != "" {
		opts.Model = p.Model
	}

	resp, err := s.cli.Complete(ctx, rendered, opts)
	if err != nil {
		return s.fallback(product), nil
	}

	return parseResponse(resp, product), nil
}

// fallback retorna copy formulaico quando o LLM falha.
func (s *Service) fallback(p ProductInput) Suggestion {
	drop := ""
	if p.Drop > 0 {
		drop = fmt.Sprintf(" (-%.0f%%)", p.Drop)
	}
	orig := ""
	if p.PriceOrig > 0 {
		orig = fmt.Sprintf("De R$ %.2f por apenas ", p.PriceOrig)
	}
	text := fmt.Sprintf("🔥 %s\n\n%sR$ %.2f%s\n\n👆 {link}",
		p.Title, orig, p.Price, drop)
	return Suggestion{
		Text:     text,
		Hashtags: []string{"#oferta", "#promocao", "#desconto"},
		EmojiSet: []string{"🔥", "💥", "👆"},
	}
}

// parseResponse tenta parsear a resposta JSON do LLM; faz fallback para texto raw.
func parseResponse(raw string, _ ProductInput) Suggestion {
	raw = strings.TrimSpace(raw)
	// Remover possível bloco markdown ```json ... ```
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var s Suggestion
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		// Resposta textual não-JSON: usar como texto da sugestão
		return Suggestion{Text: raw}
	}
	return s
}
