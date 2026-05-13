package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type TelegramAdapter struct {
	client *http.Client
	token  string
}

func NewTelegramAdapter() *TelegramAdapter {
	return &TelegramAdapter{
		client: &http.Client{Timeout: 15 * time.Second},
		token:  os.Getenv("TG_BOT_TOKEN"),
	}
}

func (a *TelegramAdapter) Configured() bool {
	return a.token != ""
}

// SendText envia mensagem de texto para um chat Telegram (chatID pode ser numérico ou @username).
func (a *TelegramAdapter) SendText(ctx context.Context, chatID, text string) error {
	if a.token == "" {
		return fmt.Errorf("TG_BOT_TOKEN não configurado")
	}
	body, _ := json.Marshal(map[string]any{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	})
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", a.token)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var errResp struct {
			Description string `json:"description"`
		}
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("telegram API %d: %s", resp.StatusCode, errResp.Description)
	}
	return nil
}

// SendPhoto envia imagem com legenda para um chat Telegram.
func (a *TelegramAdapter) SendPhoto(ctx context.Context, chatID, photoURL, caption string) error {
	if a.token == "" {
		return fmt.Errorf("TG_BOT_TOKEN não configurado")
	}
	body, _ := json.Marshal(map[string]any{
		"chat_id":    chatID,
		"photo":      photoURL,
		"caption":    caption,
		"parse_mode": "HTML",
	})
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", a.token)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var errResp struct {
			Description string `json:"description"`
		}
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("telegram API %d: %s", resp.StatusCode, errResp.Description)
	}
	return nil
}
