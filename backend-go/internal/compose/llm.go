package compose

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
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
	Fallback        bool     `json:"fallback,omitempty"` // true quando LLM falhou e usou template estático
	FallbackReason  string   `json:"fallback_reason,omitempty"`
}

// ProductInput agrega os dados necessários para gerar o prompt.
type ProductInput struct {
	Title         string
	Marketplace   string
	Price         float64
	PriceOrig     float64
	Drop          float64
	Category      string
	Brand         string
	Tone          string // ex: "promocional", "animada", "urgente", "personalizado"
	CustomContext string // texto livre quando Tone == "personalizado"
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
		return Suggestion{}, fmt.Errorf("prompt render error: %w", err)
	}

	// Injetar instrução de tom no prompt
	rendered = injectToneInstruction(rendered, product.Tone, product.CustomContext)

	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	maxTokens := p.MaxTokens
	if maxTokens == 0 { maxTokens = 512 } // garante mínimo para não truncar JSON
	opts := llm.Options{
		Operation:   "compose",
		MaxTokens:   maxTokens,
		Temperature: p.Temperature,
	}
	if p.Model != "" {
		opts.Model = p.Model
	}

	resp, err := s.cli.Complete(ctx, rendered, opts)
	if err != nil {
		slog.Warn("compose LLM falhou", "err", err)
		return Suggestion{}, fmt.Errorf("LLM error: %w", err)
	}

	return parseResponse(resp, product), nil
}

// injectToneInstruction adiciona instrução de tom ao final do prompt.
func injectToneInstruction(prompt, tone, customContext string) string {
	toneMap := map[string]string{
		"promocional": "Use um tom promocional direto, destacando economia e urgência moderada.",
		"animada":     "Use um tom animado e entusiasmado com emojis e exclamações, transmitindo empolgação.",
		"chamativa":   "Use um tom chamativo e impactante, com linguagem forte e call-to-action agressivo.",
		"urgente":     "Use um tom de urgência extrema — estoque limitado, tempo acabando, ação imediata.",
		"casual":      "Use um tom casual e descontraído, como se estivesse indicando para um amigo.",
		"formal":      "Use um tom formal e profissional, sem gírias ou emojis excessivos.",
		"personalizado": "Tom personalizado: " + customContext,
	}

	instruction := toneMap[strings.ToLower(tone)]
	if instruction == "" {
		instruction = toneMap["promocional"]
	}
	if tone == "personalizado" && customContext != "" {
		instruction = "Tom personalizado: " + customContext
	}

	return fmt.Sprintf("%s\n\n[INSTRUÇÃO DE TOM] %s\n[FORMATO] Texto para grupo de WhatsApp. Máximo 200 caracteres. Emojis são bem-vindos. Sem links nem hashtags no texto.", prompt, instruction)
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

// parseResponse tenta parsear a resposta JSON do LLM.
// Se o JSON vier truncado (max_tokens atingido), extrai o campo "text" via regex.
func parseResponse(raw string, _ ProductInput) Suggestion {
	raw = strings.TrimSpace(raw)
	// Remover bloco markdown ```json ... ```
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	// Tentativa 1: parse completo
	var s Suggestion
	if err := json.Unmarshal([]byte(raw), &s); err == nil && s.Text != "" {
		return s
	}

	// Tentativa 2: extrair campo "text" de JSON truncado via regex
	if idx := strings.Index(raw, `"text"`); idx >= 0 {
		after := raw[idx+7:] // depois de `"text"`
		// pular : e espaços
		for len(after) > 0 && (after[0] == ':' || after[0] == ' ') {
			after = after[1:]
		}
		if len(after) > 0 && after[0] == '"' {
			after = after[1:]
			// ler até a próxima aspas não escapada
			var textBuf strings.Builder
			escaped := false
			for _, c := range after {
				if escaped {
					if c == 'n' { textBuf.WriteRune('\n') } else { textBuf.WriteRune(c) }
					escaped = false
				} else if c == '\\' {
					escaped = true
				} else if c == '"' {
					break
				} else {
					textBuf.WriteRune(c)
				}
			}
			if extracted := strings.TrimSpace(textBuf.String()); extracted != "" {
				return Suggestion{Text: extracted}
			}
		}
	}

	// Tentativa 3: usar o raw como texto (resposta não-JSON do LLM)
	return Suggestion{Text: raw}
}
