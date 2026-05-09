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

	// Substituir por prompt direto com dados do produto + tom
	rendered = buildDirectPrompt(product, rendered)

	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	maxTokens := p.MaxTokens
	if maxTokens == 0 {
		maxTokens = 896 // copy WhatsApp multilinha + *negrito* — evita truncar
	}
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

// buildDirectPrompt cria um prompt direto ignorando o template JSON do registry.
// Retorna texto simples sem JSON para não confundir o LLM.
func buildDirectPrompt(p ProductInput, _ string) string {
	toneMap := map[string]string{
		"promocional": "promocional e direto, destacando economia",
		"animada":     "animado e entusiasmado com emojis",
		"chamativa":   "chamativo e impactante com call-to-action forte",
		"urgente":     "urgente — estoque limitado, aja agora",
		"casual":      "casual e amigável, como indicando para um amigo",
		"formal":      "formal e profissional",
		"personalizado": p.CustomContext,
	}
	tone := toneMap[strings.ToLower(p.Tone)]
	if tone == "" {
		tone = toneMap["promocional"]
	}

	priceInfo := ""
	if p.Price > 0 {
		priceInfo = fmt.Sprintf(" · preço atual R$ %.2f", p.Price)
	}
	brand := ""
	if p.Brand != "" {
		brand = " (" + p.Brand + ")"
	}

	dealLines := ""
	if p.PriceOrig > 0 && p.Price > 0 && p.PriceOrig > p.Price {
		dealLines += fmt.Sprintf("\nPreço de referência (para mostrar economia): de R$ %.2f para R$ %.2f.", p.PriceOrig, p.Price)
	} else if p.PriceOrig > 0 {
		dealLines += fmt.Sprintf("\nPreço de catálogo / referência citado: R$ %.2f.", p.PriceOrig)
	}
	if p.Drop > 0 {
		dealLines += fmt.Sprintf("\nDesconto aproximado: %.0f%%.", p.Drop)
	}

	return fmt.Sprintf(`Crie um ANÚNCIO para colar em GRUPO DE WHATSAPP (Brasil), formato mensagem instantânea.

Produto: %s%s%s%s
Tom: %s

FORMATAÇÃO WHATSAPP (obrigatório):
- Use VÁRIAS LINHAS CURTAS (Enter entre blocos): gancho com emoji → nome do produto → BLOCO DE PREÇO destacado → 1–2 benefícios → CTA curto (ex.: "Corre!", "Link no grupo", "Só hoje").
- Negrito no WhatsApp = *asteriscos*: exemplo *R$ 89,90* ou *Ecotools*.
- Preço antigo / De-Por: use tachado ~R$ X~ na linha do "de" e o preço atual em *negrito* na linha seguinte (se os dados permitirem economia).
- Evite parecer spam: sem CAPS LOCK inteiro, sem 10 emojis seguidos.
- NÃO envolva a mensagem em aspas. Sem JSON. Sem explicações antes ou depois.

Comprimento: até ~420 caracteres (incluindo quebras de linha).

%s`, p.Title, brand, priceInfo, dealLines, tone, strings.TrimSpace(buildDealReminder(p)))
}

// buildDealReminder reforça uso de preço tachado + negrito quando há dados de economia.
func buildDealReminder(p ProductInput) string {
	if p.PriceOrig <= 0 || p.Price <= 0 || p.PriceOrig <= p.Price {
		return ""
	}
	save := p.PriceOrig - p.Price
	return fmt.Sprintf("Dica: mencione economia real (~R$ %.2f a menos que R$ %.2f).", save, p.PriceOrig)
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

	// Substituir o prompt completo por instrução direta — evita conflito com templates JSON do registry
	_ = prompt // descartamos o template; geramos direto
	return fmt.Sprintf(`Crie uma mensagem de propaganda para WhatsApp sobre um produto.
Tom: %s
Responda APENAS com o texto da mensagem, sem JSON, sem aspas, sem explicações.
Máximo 180 caracteres. Pode usar emojis. Sem links nem hashtags.`, instruction)
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
