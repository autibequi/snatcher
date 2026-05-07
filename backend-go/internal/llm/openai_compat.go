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
	baseURL string
	apiKey  string
	httpCli *http.Client
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
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Choices) == 0 {
		errMsg := fmt.Sprintf("llm parse error: %s", rawResponse)
		recordMetric(opts.Operation, model, "parse_error", 0, 0, 0, latency, true, errMsg, prompt, rawResponse)
		return "", fmt.Errorf("%s", errMsg)
	}

	content := result.Choices[0].Message.Content
	finishReason := result.Choices[0].FinishReason

	// Detecta respostas problemáticas mesmo com HTTP 200
	if content == "" {
		errMsg := "empty content (finish_reason=" + finishReason + ")"
		recordMetric(opts.Operation, model, "empty_response", result.Usage.PromptTokens, result.Usage.CompletionTokens, 0, latency, true, errMsg, prompt, rawResponse)
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
	recordMetric(opts.Operation, model, status, result.Usage.PromptTokens, result.Usage.CompletionTokens, 0, latency, false, "", prompt, content)
	return content, nil
}
