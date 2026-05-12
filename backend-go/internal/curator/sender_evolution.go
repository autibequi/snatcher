package curator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

// EvolutionSender é o adaptador padrão usando Evolution API REST.
type EvolutionSender struct {
	BaseURL string
	APIKey  string
}

// NewEvolutionSenderFromEnv cria um EvolutionSender lendo EVOLUTION_URL e EVOLUTION_API_KEY.
func NewEvolutionSenderFromEnv() *EvolutionSender {
	return &EvolutionSender{
		BaseURL: os.Getenv("EVOLUTION_URL"),
		APIKey:  os.Getenv("EVOLUTION_API_KEY"),
	}
}

// SendText envia uma mensagem de texto via Evolution API.
func (e *EvolutionSender) SendText(ctx context.Context, instance, jid, text string) error {
	if e.BaseURL == "" {
		return fmt.Errorf("evolution: EVOLUTION_URL not set")
	}
	body, _ := json.Marshal(map[string]any{"number": jid, "text": text})
	req, err := http.NewRequestWithContext(ctx, "POST", e.BaseURL+"/message/sendText/"+instance, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("evolution: build request: %w", err)
	}
	req.Header.Set("apikey", e.APIKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("evolution: send: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("evolution: unexpected status %d for jid %s", resp.StatusCode, jid)
	}
	return nil
}
