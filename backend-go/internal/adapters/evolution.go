package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

type EvolutionAdapter struct {
	client    *http.Client
	baseURL   string
	apiKey    string
	instance  string
	accountID int64 // Optional: set for single-account adapters
}

type SendResult struct {
	Success   bool
	AccountID int64
	Error     error
}

func NewEvolution(baseURL, apiKey, instance string) *EvolutionAdapter {
	return &EvolutionAdapter{
		client:   &http.Client{Timeout: 15 * time.Second},
		baseURL:  baseURL,
		apiKey:   apiKey,
		instance: instance,
	}
}

func NewEvolutionWithAccount(accountID int64, baseURL, apiKey, instance string) *EvolutionAdapter {
	return &EvolutionAdapter{
		client:    &http.Client{Timeout: 15 * time.Second},
		baseURL:   baseURL,
		apiKey:    apiKey,
		instance:  instance,
		accountID: accountID,
	}
}

func (a *EvolutionAdapter) Provider() string { return "whatsapp" }

func (a *EvolutionAdapter) SendText(ctx context.Context, chatID, text string) error {
	body := map[string]any{
		"number":  chatID,
		"text":    text,
		"options": map[string]any{"delay": 1000},
	}
	return a.post(ctx, fmt.Sprintf("/message/sendText/%s", a.instance), body, nil)
}

func (a *EvolutionAdapter) SendImage(ctx context.Context, chatID, imageURL, caption string) error {
	body := map[string]any{
		"number": chatID,
		"mediatype": "image",
		"media":     imageURL,
		"caption":   caption,
	}
	return a.post(ctx, fmt.Sprintf("/message/sendMedia/%s", a.instance), body, nil)
}

func (a *EvolutionAdapter) GetQRCode(ctx context.Context) (string, error) {
	type qrResp struct {
		Base64 string `json:"base64"`
	}
	var resp qrResp
	if err := a.get(ctx, fmt.Sprintf("/instance/connect/%s", a.instance), &resp); err != nil {
		return "", err
	}
	return resp.Base64, nil
}

func (a *EvolutionAdapter) GetStatus(ctx context.Context) (string, error) {
	type stateResp struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	var resp stateResp
	if err := a.get(ctx, fmt.Sprintf("/instance/connectionState/%s", a.instance), &resp); err != nil {
		return "error", err
	}
	switch resp.Instance.State {
	case "open":
		return "connected", nil
	case "close":
		return "disconnected", nil
	default:
		return resp.Instance.State, nil
	}
}

func (a *EvolutionAdapter) ListGroups(ctx context.Context) ([]map[string]any, error) {
	var resp []map[string]any
	err := a.get(ctx, fmt.Sprintf("/group/fetchAllGroups/%s?getParticipants=false", a.instance), &resp)
	return resp, err
}

func (a *EvolutionAdapter) GetInviteLink(ctx context.Context, groupJID string) (string, error) {
	type inviteResp struct {
		InviteCode string `json:"inviteCode"`
		InviteURL  string `json:"inviteUrl"`
	}
	var resp inviteResp
	body := map[string]any{"groupJid": groupJID}
	if err := a.post(ctx, fmt.Sprintf("/group/inviteCode/%s", a.instance), body, &resp); err != nil {
		return "", err
	}
	if resp.InviteURL != "" {
		return resp.InviteURL, nil
	}
	return "https://chat.whatsapp.com/" + resp.InviteCode, nil
}

func (a *EvolutionAdapter) post(ctx context.Context, path string, payload any, out any) error {
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", a.baseURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", a.apiKey)

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("evolution %s: status %d — %s", path, resp.StatusCode, string(body))
	}
	if out != nil {
		return json.Unmarshal(body, out)
	}
	return nil
}

func (a *EvolutionAdapter) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, "GET", a.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apiKey", a.apiKey)

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("evolution %s: status %d — %s", path, resp.StatusCode, string(body))
	}
	if out != nil {
		return json.Unmarshal(body, out)
	}
	return nil
}

// SendTextWithFallback tries to send text to the first accountadapter; if it fails, tries next adapters in chain.
// accountAdapters should be ordered by priority (primary first, then fallbacks).
// Logs result to Prometheus: wa_send_total{account_id, target_id, result}
func SendTextWithFallback(ctx context.Context, targetID int64, chatID, text string, accountAdapters []struct {
	AccountID int64
	Adapter   *EvolutionAdapter
}) (accountID int64, err error) {
	if len(accountAdapters) == 0 {
		return 0, fmt.Errorf("no adapters provided for target %d", targetID)
	}

	var lastErr error
	for _, aa := range accountAdapters {
		if err := aa.Adapter.SendText(ctx, chatID, text); err == nil {
			slog.Info("message sent via fallback", "target_id", targetID, "account_id", aa.AccountID, "result", "success")
			return aa.AccountID, nil
		} else {
			slog.Warn("fallback attempt failed", "target_id", targetID, "account_id", aa.AccountID, "err", err)
			lastErr = err
			// Continue to next account
		}
	}

	slog.Error("all fallback attempts exhausted", "target_id", targetID, "err", lastErr)
	return 0, fmt.Errorf("all fallback accounts failed for target %d: %w", targetID, lastErr)
}

// SendImageWithFallback tries to send image via fallback chain.
func SendImageWithFallback(ctx context.Context, targetID int64, chatID, imageURL, caption string, accountAdapters []struct {
	AccountID int64
	Adapter   *EvolutionAdapter
}) (accountID int64, err error) {
	if len(accountAdapters) == 0 {
		return 0, fmt.Errorf("no adapters provided for target %d", targetID)
	}

	var lastErr error
	for _, aa := range accountAdapters {
		if err := aa.Adapter.SendImage(ctx, chatID, imageURL, caption); err == nil {
			slog.Info("image sent via fallback", "target_id", targetID, "account_id", aa.AccountID, "result", "success")
			return aa.AccountID, nil
		} else {
			slog.Warn("fallback attempt failed", "target_id", targetID, "account_id", aa.AccountID, "err", err)
			lastErr = err
		}
	}

	slog.Error("all fallback attempts exhausted", "target_id", targetID, "err", lastErr)
	return 0, fmt.Errorf("all fallback accounts failed for target %d: %w", targetID, lastErr)
}
