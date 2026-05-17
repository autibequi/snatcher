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

// usageContextKey é a chave privada usada para injetar CallUsage no contexto.
// Uso privado ao pacote — callers externos usam WithCallUsage e CallUsageFromContext.
type usageContextKey struct{}

// CallUsage carrega tokens reais consumidos em uma chamada LLM.
// É preenchido pelo provider (ex: OpenRouterClient) e lido pelo BudgetGuard
// para calcular o custo real em vez de uma estimativa fixa.
type CallUsage struct {
	TokensIn  int
	TokensOut int
}

// WithCallUsage injeta um ponteiro de CallUsage no contexto.
// O provider preenche os campos após a chamada; o BudgetGuard lê ao cobrar.
func WithCallUsage(ctx context.Context) (context.Context, *CallUsage) {
	usage := &CallUsage{}
	return context.WithValue(ctx, usageContextKey{}, usage), usage
}

// CallUsageFromContext retorna o ponteiro de CallUsage do contexto, ou nil se ausente.
func CallUsageFromContext(ctx context.Context) *CallUsage {
	value := ctx.Value(usageContextKey{})
	if value == nil {
		return nil
	}
	usage, ok := value.(*CallUsage)
	if !ok {
		return nil
	}
	return usage
}
