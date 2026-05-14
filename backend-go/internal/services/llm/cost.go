package llm

import "strings"

// pricePerToken: tabela de custo USD por token (input, output) por modelo.
// Valores referência OpenRouter/OpenAI/Anthropic — atualize conforme provider.
var pricePerToken = map[string][2]float64{
	// OpenAI
	"openai/gpt-4o":               {2.5e-6, 10e-6},
	"openai/gpt-4o-mini":          {0.15e-6, 0.6e-6},
	"openai/o1-mini":              {3e-6, 12e-6},
	"openai/o1-preview":           {15e-6, 60e-6},
	"openai/gpt-4-turbo":          {10e-6, 30e-6},
	"openai/gpt-3.5-turbo":        {0.5e-6, 1.5e-6},
	// Anthropic
	"anthropic/claude-3.5-sonnet": {3e-6, 15e-6},
	"anthropic/claude-3-opus":     {15e-6, 75e-6},
	"anthropic/claude-3-haiku":    {0.25e-6, 1.25e-6},
	"anthropic/claude-3.5-haiku":  {1e-6, 5e-6},
	// Google
	"google/gemini-2.0-flash":     {0.075e-6, 0.3e-6},
	"google/gemini-pro-1.5":       {1.25e-6, 5e-6},
	// Meta (via OpenRouter)
	"meta-llama/llama-3.1-70b-instruct":  {0.35e-6, 0.4e-6},
	"meta-llama/llama-3.1-8b-instruct":   {0.05e-6, 0.05e-6},
	"meta-llama/llama-3.3-70b-instruct":  {0.12e-6, 0.3e-6},
	// Mistral
	"mistralai/mistral-large":     {2e-6, 6e-6},
	"mistralai/mistral-7b":        {0.05e-6, 0.05e-6},
	"mistralai/mixtral-8x7b":      {0.24e-6, 0.24e-6},
	// Qwen
	"qwen/qwen-2.5-72b-instruct":  {0.4e-6, 0.4e-6},
	"qwen/qwen-2.5-7b-instruct":   {0.07e-6, 0.07e-6},
	// DeepSeek
	"deepseek/deepseek-chat":      {0.14e-6, 0.28e-6},
	"deepseek/deepseek-r1":        {0.55e-6, 2.19e-6},
}

// EstimateCost calcula o custo USD de uma chamada baseado no modelo.
// Retorna 0 para Ollama local (qualquer coisa que não bata na tabela).
// Faz lookup case-insensitive e prefix-match (ex: "openai/gpt-4o-mini-2024-07-18" → "openai/gpt-4o-mini").
func EstimateCost(model string, tokIn, tokOut int) float64 {
	if tokIn == 0 && tokOut == 0 {
		return 0
	}
	m := strings.ToLower(strings.TrimSpace(model))
	if c, ok := pricePerToken[m]; ok {
		return float64(tokIn)*c[0] + float64(tokOut)*c[1]
	}
	// Prefix match — modelos com versão/data no fim
	for prefix, c := range pricePerToken {
		if strings.HasPrefix(m, prefix) {
			return float64(tokIn)*c[0] + float64(tokOut)*c[1]
		}
	}
	// Modelo local (ollama, lm-studio etc) — sem custo
	return 0
}
