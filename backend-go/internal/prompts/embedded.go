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
max_tokens: 150
temperature: 0.5
---
Crie nome e descrição para cluster de canais de promoção.

Top categorias: {{.TopCategories}}
Top marcas: {{.TopBrands}}
CTR: {{.CTR}}% | CVR: {{.CVR}}% | Ticket médio: R$ {{printf "%.0f" .AvgTicket}}

Responda JSON: {"label":"2-4 palavras","description":"1 frase"}`)

	return []*Prompt{compose, parseOffer, clusterLabel}
}

func mustParse(op, version, content string) *Prompt {
	p, err := parsePromptFile(op, version+".tmpl", []byte(content))
	if err != nil {
		panic(fmt.Sprintf("embedded prompt %s/%s: %v", op, version, err))
	}
	return p
}
