package prompts

import "fmt"

func embeddedPrompts() []*Prompt {
	compose := mustParse("compose", "v1", `---
model: anthropic/claude-3.5-sonnet
max_tokens: 1000
temperature: 0.7
---
Você é um copywriter de promoções para grupos WhatsApp/Telegram brasileiros.

PRODUTO:
- Título: {{.Product.Title}}
- Marketplace: {{.Product.Marketplace}}
- Preço atual: R$ {{printf "%.2f" .Product.Price}}
- Desconto: {{printf "%.0f" .Product.Drop}}%

{{if .Channel}}AUDIÊNCIA: {{.Channel.Name}}{{end}}

Gere copy persuasivo (max 400 chars), hashtags (3-5), emojis (2-4).
Responda APENAS em JSON: {"text":"...","hashtags":["..."],"emoji_set":["..."],"media_suggestion":"..."}`)

	parseOffer := mustParse("parse_offer", "v1", `---
model: openai/gpt-4o-mini
max_tokens: 250
temperature: 0.0
---
Extraia produto de mensagem de grupo de promoções brasileiro.

MENSAGEM:
{{.RawMessage}}

LINKS: {{range .Links}}- {{.}}
{{end}}

Responda JSON: {"is_offer":bool,"title":"...","marketplace":"...","price_current":0.0,"price_original":null,"drop_pct":null,"url":null}`)

	clusterLabel := mustParse("cluster_label", "v1", `---
model: anthropic/claude-3.5-sonnet
max_tokens: 120
temperature: 0.35
---
Nome breve para cluster de canais de promoção (somente dados abaixo).

Cats: {{.TopCategories}} | Marcas: {{.TopBrands}}
CTR {{printf "%.2f" .CTR}}%% | CVR {{printf "%.2f" .CVR}}%% | Ticket R$ {{printf "%.0f" .AvgTicket}}

JSON: {"label":"2-4 palavras","description":"uma frase"}`)

	return []*Prompt{compose, parseOffer, clusterLabel}
}

func mustParse(op, version, content string) *Prompt {
	p, err := parsePromptFile(op, version+".tmpl", []byte(content))
	if err != nil {
		panic(fmt.Sprintf("embedded prompt %s/%s: %v", op, version, err))
	}
	return p
}
