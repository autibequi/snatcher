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

// integrationBaileys é o tipo de integração WhatsApp via Baileys (cliente web não-oficial)
// exigido pela Evolution API v2 ao criar uma instância.
const integrationBaileys = "WHATSAPP-BAILEYS"

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

// InstanceConnect obtém o QR code de pareamento da instância. Usa /instance/connect —
// o único endpoint da Evolution que devolve o QR (InstanceStatus/connectionState só
// retorna o estado, nunca o QR). Se a instância ainda não existe na Evolution (404),
// cria sob demanda: assim um redeploy que limpe o volume evo_instances se recupera
// sozinho, sem precisar criar a instância manualmente.
func (c *Client) InstanceConnect(ctx context.Context, instance string) (string, string, error) {
	data, status, err := c.do(ctx, http.MethodGet,
		fmt.Sprintf("/instance/connect/%s", instance), nil)
	if err != nil {
		return "disconnected", "", err
	}
	if status == http.StatusNotFound {
		return c.createInstance(ctx, instance)
	}
	if status >= 400 {
		return "disconnected", "", fmt.Errorf("evolution connect: HTTP %d", status)
	}
	var resp struct {
		Base64   string `json:"base64"`
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	_ = json.Unmarshal(data, &resp)
	// Quando a instância já está pareada, o connect não devolve QR nem estado aqui —
	// reporta "connecting" para o caller distinguir de uma falha real.
	state := resp.Instance.State
	if state == "" {
		state = "connecting"
	}
	return state, resp.Base64, nil
}

// createInstance registra a instância na Evolution com QR habilitado e devolve o QR já
// gerado na resposta da criação. Chamado por InstanceConnect quando a instância não
// existe (404).
func (c *Client) createInstance(ctx context.Context, instance string) (string, string, error) {
	payload := map[string]any{
		"instanceName": instance,
		"integration":  integrationBaileys,
		"qrcode":       true,
	}
	data, status, err := c.do(ctx, http.MethodPost, "/instance/create", payload)
	if err != nil {
		return "disconnected", "", err
	}
	if status >= 400 {
		return "disconnected", "", fmt.Errorf("evolution create instance: HTTP %d", status)
	}
	var resp struct {
		Instance struct {
			Status string `json:"status"`
		} `json:"instance"`
		QRCode struct {
			Base64 string `json:"base64"`
		} `json:"qrcode"`
	}
	_ = json.Unmarshal(data, &resp)
	return resp.Instance.Status, resp.QRCode.Base64, nil
}
