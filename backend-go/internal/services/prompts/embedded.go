package prompts

import "fmt"

func embeddedPrompts() []*Prompt {
	compose := mustParse("compose", "v1", `---
model: anthropic/claude-3.5-sonnet
max_tokens: 1000
temperature: 0.7
---
Você é um copywriter de promoções para grupos WhatsApp/Telegram (Brasil).

PRODUTO:
- Título: {{.Product.Title}}
- Marketplace: {{.Product.Marketplace}}
- Preço atual: R$ {{printf "%.2f" .Product.Price}}
- Desconto: {{printf "%.0f" .Product.Drop}}%

{{if .Channel}}AUDIÊNCIA: {{.Channel.Name}}{{end}}

Estilo de saída (alinhado ao disparo real):
- Várias linhas curtas; bloco de preço destacado; *negrito WhatsApp* com asteriscos; ~tachado~ para preço antigo quando fizer sentido.
- Tom brasileiro, sem CAPS inteiro; emojis com moderação.
- Comprimento típico até ~420 caracteres incluindo quebras de linha.

Nota: o servidor pode substituir este texto por um prompt direto; mantenha este template como referência de formato.

Responda APENAS em JSON: {"text":"...","hashtags":["..."],"emoji_set":["..."],"media_suggestion":"..."}`)

	parseOffer := mustParse("parse_offer", "v1", `---
model: openai/gpt-4o-mini
max_tokens: 320
temperature: 0.0
---
Extraia produto de mensagem de grupo de promoções (Brasil). Mensagens costumam ter formatação de WhatsApp: *negrito*, ~tachado~, várias linhas, emojis; preços como R$ 180, R$180,00, "por 180", "de/por".

Ignore os caracteres de formatação ao montar o título limpo.
Se houver "de X por Y", use price_original (maior) e price_current (menor).

MENSAGEM:
{{.RawMessage}}

LINKS: {{range .Links}}- {{.}}
{{end}}

Responda JSON: {"is_offer":bool,"title":"...","marketplace":"...","price_current":0.0,"price_original":null,"drop_pct":null,"url":null}`)

	clusterLabel := mustParse("cluster_label", "v1", `---
model: anthropic/claude-3.5-sonnet
max_tokens: 120
temperature: 0.2
---
Nome breve em pt-BR para cluster de canais de ofertas (UI / relatórios / mentalmente parecido com título de grupo).

Cats: {{.TopCategories}} | Marcas: {{.TopBrands}}
CTR {{printf "%.2f" .CTR}}%% | CVR {{printf "%.2f" .CVR}}%% | Ticket R$ {{printf "%.0f" .AvgTicket}}

REGRAS DE SAÍDA (obrigatório):
- Responda APENAS um objeto JSON válido, sem markdown, sem cercas de código, sem rótulo "**JSON**", sem texto antes ou depois.
- O primeiro caractere não-espaço da resposta deve ser "{" e o último "}".
- Campos exatos: "label" (string, 2–4 palavras memoráveis em pt-BR) e "description" (string, uma frase objetiva sobre o perfil do cluster).

{"label":"...","description":"..."}`)

	// rephrase_reasons reformula razões de compra para mensagens WhatsApp mais engajantes.
	// Input: {Reasons []string, Language string} — Language é pt-BR por padrão.
	// Registrado na tabela llm_op_budgets (migration 20260512000018) com budget 0.50 USD/dia.
	rephraseReasons := mustParse("rephrase_reasons", "v1", `---
model: openai/gpt-4o-mini
max_tokens: 200
temperature: 0.3
---
Você é um copywriter especializado em mensagens de promoção para WhatsApp (Brasil).

Dadas as razões de compra abaixo, reformule-as para serem mais engajantes e concisas.
Idioma de saída: {{if .Language}}{{.Language}}{{else}}pt-BR{{end}}

Razões originais:
{{range .Reasons}}- {{.}}
{{end}}

REGRAS:
- Responda APENAS um array JSON válido, sem markdown, sem cercas de código.
- Máximo 3 itens no array.
- Cada item: string curta, no máximo 20 palavras, tom conversacional WhatsApp.
- Emojis com moderação; sem CAPS inteiro.

["razão reformulada 1","razão reformulada 2","razão reformulada 3"]`)

	return []*Prompt{compose, parseOffer, clusterLabel, rephraseReasons}
}

func mustParse(op, version, content string) *Prompt {
	p, err := parsePromptFile(op, version+".tmpl", []byte(content))
	if err != nil {
		panic(fmt.Sprintf("embedded prompt %s/%s: %v", op, version, err))
	}
	return p
}
