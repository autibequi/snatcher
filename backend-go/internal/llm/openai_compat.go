package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// OpenAICompatClient funciona com qualquer API compatível com OpenAI:
// OpenRouter, Ollama (/v1/chat/completions), LM Studio, etc.
type OpenAICompatClient struct {
	baseURL          string
	apiKey           string
	httpCli          *http.Client
	reasoningEnabled bool // default false: manda reasoning:{enabled:false} pra desligar chain-of-thought (deepseek-v4, gpt-5, r1)
}

// WithReasoning ativa o reasoning explicitamente no provider (default off).
// Quando off, injeta reasoning:{enabled:false, effort:"minimal"} em todo request.
// Doc: https://openrouter.ai/docs/use-cases/reasoning-tokens
func (c *OpenAICompatClient) WithReasoning(enabled bool) *OpenAICompatClient {
	c.reasoningEnabled = enabled
	return c
}

// extractLastJSON procura o último bloco JSON válido (objeto `{...}`) em uma string.
// Útil pra extrair JSON do campo `reasoning` de modelos thinking que emitem
// o JSON dentro do raciocínio em vez do content.
func extractLastJSON(s string) string {
	if s == "" {
		return ""
	}
	// Remove markdown fences
	s = strings.ReplaceAll(s, "```json", "")
	s = strings.ReplaceAll(s, "```", "")

	// Procura o último '{' e tenta balancear até o '}' correspondente
	for start := strings.LastIndex(s, "{"); start >= 0; start = strings.LastIndex(s[:start], "{") {
		depth := 0
		inStr := false
		escaped := false
		for i := start; i < len(s); i++ {
			c := s[i]
			if escaped {
				escaped = false
				continue
			}
			if c == '\\' && inStr {
				escaped = true
				continue
			}
			if c == '"' {
				inStr = !inStr
				continue
			}
			if inStr {
				continue
			}
			if c == '{' {
				depth++
			} else if c == '}' {
				depth--
				if depth == 0 {
					candidate := s[start : i+1]
					// validação básica — tem que ter pelo menos uma chave/valor
					if strings.Contains(candidate, ":") {
						return candidate
					}
					break
				}
			}
		}
	}
	return ""
}

// NewOpenAICompat cria cliente para {baseURL}/chat/completions.
// Para Ollama: baseURL = "http://ollama:11434/v1"
// Para OpenRouter: baseURL = "https://openrouter.ai/api/v1"
func NewOpenAICompat(baseURL, apiKey string) *OpenAICompatClient {
	return &OpenAICompatClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		// 5min — Ollama local pode demorar na primeira inferência (cold model load)
		httpCli: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (c *OpenAICompatClient) Complete(ctx context.Context, prompt string, opts Options) (string, error) {
	out, err := c.complete(ctx, prompt, opts)
	if err != nil {
		errStr := err.Error()
		// Retry sem reasoning: modelo exige reasoning obrigatório e rejeita o disable
		if !c.reasoningEnabled && strings.Contains(errStr, "Reasoning is mandatory") {
			saved := c.reasoningEnabled
			c.reasoningEnabled = true // não envia o bloco reasoning neste retry
			out2, err2 := c.complete(ctx, prompt, opts)
			c.reasoningEnabled = saved
			if err2 == nil {
				return out2, nil
			}
		}
		// Retry sem web search: modelos free quebram com web plugin
		if opts.WebSearch && (strings.Contains(errStr, "empty content") || strings.Contains(errStr, "no JSON found")) {
			retryOpts := opts
			retryOpts.WebSearch = false
			retryOpts.Operation = opts.Operation + "_retry_nowebsearch"
			if out2, err2 := c.complete(ctx, prompt, retryOpts); err2 == nil {
				return out2, nil
			}
		}
	}
	return out, err
}

func (c *OpenAICompatClient) complete(ctx context.Context, prompt string, opts Options) (string, error) {
	start := time.Now()
	model := opts.Model
	if model == "" {
		model = "llama3"
	}

	messages := []map[string]string{}
	if opts.JSONMode {
		// System message força resposta JSON direta:
		// - "/no_think" desliga o thinking de qwen3.x (ignorado por outros modelos)
		// - Instrução explícita pra outros modelos
		messages = append(messages, map[string]string{
			"role": "system",
			"content": "/no_think\nVocê é um extrator de dados estruturados. Responda EXCLUSIVAMENTE com JSON válido conforme o schema solicitado. NÃO use raciocínio interno, NÃO use tags <think>, NÃO use markdown. Apenas JSON puro.",
		})
	}
	messages = append(messages, map[string]string{"role": "user", "content": prompt})

	reqBody := map[string]any{
		"model":       model,
		"messages":    messages,
		"temperature": opts.Temperature,
	}
	if opts.MaxTokens > 0 {
		reqBody["max_tokens"] = opts.MaxTokens
	}
	if opts.JSONMode {
		// OpenAI/OpenRouter: response_format. Ollama (compat /v1) também aceita.
		reqBody["response_format"] = map[string]string{"type": "json_object"}
		// Ollama nativo aceita também o campo "format" — incluímos para compat
		reqBody["format"] = "json"
	}
	if opts.WebSearch && strings.Contains(c.baseURL, "openrouter.ai") {
		// OpenRouter web plugin — habilita busca online no modelo (resultado vem citado no content)
		reqBody["plugins"] = []map[string]any{{"id": "web"}}
	}
	if !c.reasoningEnabled {
		// Default: desliga chain-of-thought no provider. Evita truncamento em modelos
		// reasoning (deepseek-v4, gpt-5, r1) que gastam max_tokens no thinking antes do JSON.
		// Provider que não suporta reasoning ignora silenciosamente.
		reqBody["reasoning"] = map[string]any{"enabled": false, "effort": "minimal"}
	}

	b, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(b))
	if err != nil {
		recordMetric(opts.Operation, model, "error", 0, 0, 0, time.Since(start).Seconds(), true, err.Error(), prompt, "")
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpCli.Do(req)
	if err != nil {
		errMsg := fmt.Errorf("llm request: %w", err).Error()
		recordMetric(opts.Operation, model, "error", 0, 0, 0, time.Since(start).Seconds(), true, errMsg, prompt, "")
		return "", fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	latency := time.Since(start).Seconds()
	rawResponse := string(body)

	if resp.StatusCode >= 400 {
		errMsg := fmt.Sprintf("llm status %d: %s", resp.StatusCode, rawResponse)
		recordMetric(opts.Operation, model, fmt.Sprintf("http_%d", resp.StatusCode), 0, 0, 0, latency, true, errMsg, prompt, rawResponse)
		return "", fmt.Errorf("%s", errMsg)
	}

	var result struct {
		Model   string `json:"model"` // OpenRouter retorna o modelo escolhido (ex: "auto" → "meta-llama/llama-3.3-70b-instruct")
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				Reasoning string `json:"reasoning"` // qwen3/deepseek-r1 emitem thinking aqui
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int     `json:"prompt_tokens"`
			CompletionTokens int     `json:"completion_tokens"`
			TotalTokens      int     `json:"total_tokens"`
			Cost             float64 `json:"cost"` // OpenRouter retorna custo real quando disponível
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Choices) == 0 {
		errMsg := fmt.Sprintf("llm parse error: %s", rawResponse)
		recordMetric(opts.Operation, model, "parse_error", 0, 0, 0, latency, true, errMsg, prompt, rawResponse)
		return "", fmt.Errorf("%s", errMsg)
	}

	content := result.Choices[0].Message.Content
	reasoning := result.Choices[0].Message.Reasoning
	finishReason := result.Choices[0].FinishReason

	// Fallback: se content vazio mas reasoning existe (modelos thinking),
	// tenta extrair o último JSON válido do reasoning.
	// Modelos como qwen3/deepseek-r1 às vezes terminam o thinking emitindo o JSON real
	// dentro do próprio reasoning, em vez de no content.
	if content == "" && reasoning != "" {
		if extracted := extractLastJSON(reasoning); extracted != "" {
			content = extracted
		}
	}

	// Detecta respostas problemáticas mesmo com HTTP 200
	if content == "" {
		var errMsg string
		if reasoning != "" {
			errMsg = "model returned only reasoning, no JSON found (finish_reason=" + finishReason + ", completion_tokens=" + fmt.Sprintf("%d", result.Usage.CompletionTokens) + "). Aumente max_tokens ou troque para modelo não-thinking (llama3.1/qwen2.5/mistral)"
		} else {
			errMsg = "empty content (finish_reason=" + finishReason + ")"
		}
		fullDebug := rawResponse
		if reasoning != "" {
			fullDebug = "REASONING:\n" + reasoning + "\n\n--- FULL RESPONSE ---\n" + rawResponse
		}
		recordMetric(opts.Operation, model, "empty_response", result.Usage.PromptTokens, result.Usage.CompletionTokens, 0, latency, true, errMsg, prompt, fullDebug)
		return "", fmt.Errorf("%s", errMsg)
	}
	if finishReason == "length" {
		// resposta truncada por max_tokens — quase sempre vai falhar no parse
		errMsg := "response truncated (finish_reason=length, completion_tokens=" + fmt.Sprintf("%d", result.Usage.CompletionTokens) + ") — aumente max_tokens"
		recordMetric(opts.Operation, model, "truncated", result.Usage.PromptTokens, result.Usage.CompletionTokens, 0, latency, true, errMsg, prompt, content)
		return content, fmt.Errorf("%s", errMsg)
	}

	// Detecta resposta "só raciocínio" (<think>...</think> sem JSON depois) — comum em deepseek-r1/qwen3
	useful := strings.TrimSpace(content)
	if i := strings.Index(useful, "</think>"); i >= 0 {
		useful = strings.TrimSpace(useful[i+len("</think>"):])
	}
	if useful == "" {
		errMsg := "modelo retornou apenas <think> sem conteúdo útil — aumente max_tokens ou peça resposta direta"
		recordMetric(opts.Operation, model, "no_output", result.Usage.PromptTokens, result.Usage.CompletionTokens, 0, latency, true, errMsg, prompt, content)
		return content, fmt.Errorf("%s", errMsg)
	}

	status := "ok"
	if finishReason != "" && finishReason != "stop" {
		status = finishReason
	}

	// Modelo real (OpenRouter pode retornar diferente do solicitado em caso de "auto")
	loggedModel := model
	if result.Model != "" && result.Model != model {
		loggedModel = result.Model
	}
	// Custo: usa o que veio na resposta (OpenRouter) ou estima pela tabela
	cost := result.Usage.Cost
	if cost == 0 {
		cost = EstimateCost(loggedModel, result.Usage.PromptTokens, result.Usage.CompletionTokens)
	}

	recordMetric(opts.Operation, loggedModel, status, result.Usage.PromptTokens, result.Usage.CompletionTokens, cost, latency, false, "", prompt, content)
	return content, nil
}
