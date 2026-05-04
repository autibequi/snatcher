package evolution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	baseURL string
	apiKey  string
	httpCli *http.Client
}

func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpCli: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) do(ctx context.Context, method, path string, body any) ([]byte, int, error) {
	var buf io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		buf = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, buf)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("apikey", c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpCli.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

// SendText envia mensagem de texto via Evolution API.
func (c *Client) SendText(ctx context.Context, instance, remoteJID, text string, delayMs int) error {
	payload := map[string]any{
		"number": remoteJID,
		"text":   text,
		"delay":  delayMs,
	}
	_, status, err := c.do(ctx, http.MethodPost,
		fmt.Sprintf("/message/sendText/%s", instance), payload)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("evolution sendText: HTTP %d", status)
	}
	return nil
}

// InstanceStatus retorna o status da instância.
func (c *Client) InstanceStatus(ctx context.Context, instance string) (string, string, error) {
	data, status, err := c.do(ctx, http.MethodGet,
		fmt.Sprintf("/instance/connectionState/%s", instance), nil)
	if err != nil || status >= 400 {
		return "disconnected", "", err
	}
	var resp struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	_ = json.Unmarshal(data, &resp)
	return resp.Instance.State, "", nil
}
