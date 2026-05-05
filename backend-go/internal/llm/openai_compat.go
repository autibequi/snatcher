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
		httpCli: &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *OpenAICompatClient) Complete(ctx context.Context, prompt string, opts Options) (string, error) {
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
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpCli.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("llm status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Choices) == 0 {
		return "", fmt.Errorf("llm parse error: %s", string(body))
	}
	return result.Choices[0].Message.Content, nil
}
