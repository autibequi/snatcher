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

	reqBody := map[string]any{
		"model":       model,
		"messages":    []map[string]string{{"role": "user", "content": prompt}},
		"temperature": opts.Temperature,
	}
	if opts.MaxTokens > 0 {
		reqBody["max_tokens"] = opts.MaxTokens
	}

	b, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(b))
	if err != nil {
		recordMetric(opts.Operation, model, "error", 0, 0, 0, time.Since(start).Seconds(), true, err.Error())
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpCli.Do(req)
	if err != nil {
		errMsg := fmt.Errorf("llm request: %w", err).Error()
		recordMetric(opts.Operation, model, "error", 0, 0, 0, time.Since(start).Seconds(), true, errMsg)
		return "", fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	latency := time.Since(start).Seconds()

	if resp.StatusCode >= 400 {
		errMsg := fmt.Sprintf("llm status %d: %s", resp.StatusCode, string(body))
		recordMetric(opts.Operation, model, fmt.Sprintf("http_%d", resp.StatusCode), 0, 0, 0, latency, true, errMsg)
		return "", fmt.Errorf("%s", errMsg)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Choices) == 0 {
		errMsg := fmt.Sprintf("llm parse error: %s", string(body))
		recordMetric(opts.Operation, model, "parse_error", 0, 0, 0, latency, true, errMsg)
		return "", fmt.Errorf("%s", errMsg)
	}

	recordMetric(opts.Operation, model, "ok", result.Usage.PromptTokens, result.Usage.CompletionTokens, 0, latency, false, "")
	return result.Choices[0].Message.Content, nil
}
