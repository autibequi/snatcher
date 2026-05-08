package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/time/rate"
)

const openRouterURL = "https://openrouter.ai/api/v1/chat/completions"

type OpenRouterClient struct {
	apiKey  string
	httpCli *http.Client
	limiter *rate.Limiter
}

func NewOpenRouter(apiKey string) *OpenRouterClient {
	return &OpenRouterClient{
		apiKey:  apiKey,
		httpCli: &http.Client{Timeout: 30 * time.Second},
		limiter: rate.NewLimiter(rate.Every(time.Second), 10), // 10 req/s
	}
}

type orRequest struct {
	Model       string         `json:"model"`
	Messages    []orMessage    `json:"messages"`
	MaxTokens   int            `json:"max_tokens,omitempty"`
	Temperature float64        `json:"temperature,omitempty"`
	Reasoning   map[string]any `json:"reasoning,omitempty"`
}

type orMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type orResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (c *OpenRouterClient) Complete(ctx context.Context, prompt string, opts Options) (string, error) {
	if err := c.limiter.Wait(ctx); err != nil {
		return "", fmt.Errorf("llm rate limit: %w", err)
	}

	model := opts.Model
	if model == "" {
		model = "openai/gpt-4o-mini"
	}
	maxTokens := opts.MaxTokens
	if maxTokens == 0 {
		maxTokens = 500
	}
	temp := opts.Temperature
	if temp == 0 {
		temp = 0.3
	}

	reasoningOff := false
	payload := orRequest{
		Model:       model,
		Messages:    []orMessage{{Role: "user", Content: prompt}},
		MaxTokens:   maxTokens,
		Temperature: temp,
		Reasoning:   &orReasoning{Enabled: &reasoningOff, Effort: "minimal"},
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(time.Duration(1<<attempt) * time.Second):
			}
		}

		resp, err := c.do(ctx, payload)
		if err != nil {
			lastErr = err
			continue
		}
		if resp.Error != nil {
			lastErr = fmt.Errorf("openrouter: %s", resp.Error.Message)
			continue
		}
		if len(resp.Choices) == 0 {
			lastErr = fmt.Errorf("openrouter: no choices in response")
			continue
		}

		recordUsage(opts.Operation, model, resp.Usage.PromptTokens, resp.Usage.CompletionTokens)
		return resp.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("llm after 3 attempts: %w", lastErr)
}

func (c *OpenRouterClient) do(ctx context.Context, payload orRequest) (*orResponse, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openRouterURL, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Title", "Snatcher")

	res, err := c.httpCli.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode == 429 || res.StatusCode >= 500 {
		return nil, fmt.Errorf("openrouter HTTP %d", res.StatusCode)
	}
	var resp orResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &resp, nil
}
