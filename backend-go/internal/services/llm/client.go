package llm

import "context"

// Client é a interface de LLM.
type Client interface {
	Complete(ctx context.Context, prompt string, opts Options) (string, error)
}

// Options configura uma chamada de LLM.
type Options struct {
	Model       string
	MaxTokens   int
	Temperature float64
	Operation   string // label para telemetria e roteamento: "query_expansion", "compose", etc.
	JSONMode    bool   // força resposta em JSON via response_format / format do Ollama (evita reasoning verboso)
	WebSearch   bool   // habilita busca online (OpenRouter web plugin) — útil pra enriquecer com dados atuais
}
