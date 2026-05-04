package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
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
	llm llm.Client
}

// NewService cria um Service com o llm.Client injetado.
// Passar um llm.CachedClient garante TTL 1h via cache Postgres.
func NewService(cli llm.Client) *Service {
	return &Service{llm: cli}
}

// Preview gera copy de disparo para um produto + canal opcional.
//
// Timeout interno de 8s; em caso de falha retorna fallback humano sem error.
func (s *Service) Preview(ctx context.Context, product ProductInput, channel *models.Channel) (Suggestion, error) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	channelCtx := buildChannelContext(channel)
	prompt := buildPrompt(product, channelCtx)

	raw, err := s.llm.Complete(ctx, prompt, llm.Options{
		Operation: "compose",
		MaxTokens: 400,
	})
	if err != nil {
		return fallback(product), nil
	}

	return parseResponse(raw, product)
}

// fallback retorna copy formulaico quando o LLM falha.
func fallback(p ProductInput) Suggestion {
	drop := ""
	if p.Drop > 0 {
		drop = fmt.Sprintf(" (-%.0f%%)", p.Drop)
	}
	orig := ""
	if p.PriceOrig > 0 {
		orig = fmt.Sprintf("De R$ %.2f por apenas ", p.PriceOrig)
	}
	text := fmt.Sprintf("🔥 %s\n\n%sR$ %.2f%s\n\n👆 Link no perfil",
		p.Title, orig, p.Price, drop)
	return Suggestion{
		Text:     text,
		Hashtags: []string{"#oferta", "#promocao", "#desconto"},
		EmojiSet: []string{"🔥", "💥", "👆"},
	}
}

// parseResponse tenta parsear a resposta JSON do LLM; faz fallback para texto raw.
func parseResponse(raw string, p ProductInput) (Suggestion, error) {
	raw = strings.TrimSpace(raw)
	// Remover possível bloco markdown ```json ... ```
	if strings.HasPrefix(raw, "```") {
		lines := strings.Split(raw, "\n")
		if len(lines) >= 3 {
			raw = strings.Join(lines[1:len(lines)-1], "\n")
		}
	}
	var s Suggestion
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		// Resposta textual não-JSON: usar como texto da sugestão
		return Suggestion{Text: raw}, nil
	}
	return s, nil
}

func buildChannelContext(ch *models.Channel) string {
	if ch == nil {
		return ""
	}
	parts := []string{fmt.Sprintf("\nAUDIÊNCIA: %s", ch.Name)}
	if len(ch.Audience.Categories) > 0 {
		parts = append(parts, fmt.Sprintf("Categorias de interesse: %s", strings.Join(ch.Audience.Categories, ", ")))
	}
	if len(ch.Audience.Brands) > 0 {
		parts = append(parts, fmt.Sprintf("Marcas preferidas: %s", strings.Join(ch.Audience.Brands, ", ")))
	}
	if ch.Audience.Gender != "" {
		parts = append(parts, fmt.Sprintf("Gênero: %s", ch.Audience.Gender))
	}
	return strings.Join(parts, "\n")
}

func buildPrompt(p ProductInput, channelCtx string) string {
	return fmt.Sprintf(`Você é copywriter de promoções para grupos WhatsApp/Telegram brasileiros.

PRODUTO:
- Título: %s
- Marketplace: %s
- Preço atual: R$ %.2f
- Preço original: R$ %.2f
- Desconto: %.0f%%
- Categoria: %s
- Marca: %s%s

Gere copy persuasivo (max 400 chars), hashtags (3-5), emojis (2-4) e sugira a imagem ideal.

Responda APENAS em JSON com campos: text (string), hashtags (array), emoji_set (array), media_suggestion (string).`,
		p.Title, p.Marketplace, p.Price, p.PriceOrig, p.Drop,
		p.Category, p.Brand, channelCtx)
}
