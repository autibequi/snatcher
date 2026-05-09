package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"snatcher/backendv2/internal/invitelinks"
	"snatcher/backendv2/internal/models"
)

// FetchAndPersistWhatsAppInvite busca o link de convite na Evolution API e grava em groups.invite_link.
// Usado pela página pública /canal/{slug} quando o grupo ainda não tem invite persistido.
func (s *SQLStore) FetchAndPersistWhatsAppInvite(ctx context.Context, groupID int64) (string, error) {
	g, err := s.GetRedesignGroup(groupID)
	if err != nil {
		return "", err
	}
	if g.Platform != "whatsapp" {
		return "", fmt.Errorf("grupo não é WhatsApp")
	}
	if !g.JID.Valid || strings.TrimSpace(g.JID.String) == "" {
		return "", fmt.Errorf("grupo sem JID")
	}
	if !g.WAAccountID.Valid {
		return "", fmt.Errorf("grupo sem conta WA")
	}

	acc, err := s.GetWAAccount(g.WAAccountID.Int64)
	if err != nil {
		return "", err
	}
	cfg, _ := s.GetConfig()
	baseURL, apiKey, instance := strings.TrimSpace(acc.BaseURL.String), strings.TrimSpace(acc.APIKey.String), strings.TrimSpace(acc.Instance.String)
	if baseURL == "" && cfg.WABaseURL.Valid {
		baseURL = strings.TrimSpace(cfg.WABaseURL.String)
	}
	if apiKey == "" && cfg.WAApiKey.Valid {
		apiKey = strings.TrimSpace(cfg.WAApiKey.String)
	}
	if instance == "" && cfg.WAInstance.Valid {
		instance = strings.TrimSpace(cfg.WAInstance.String)
	}
	if baseURL == "" {
		return "", fmt.Errorf("Evolution não configurada")
	}

	link, err := fetchWhatsAppInviteFromEvolution(ctx, baseURL, apiKey, instance, g.JID.String)
	if err != nil {
		return "", err
	}
	link = invitelinks.NormalizeWhatsAppInvite(link)
	g.InviteLink = models.NullString{NullString: sql.NullString{String: link, Valid: true}}
	if err := s.UpdateRedesignGroup(g); err != nil {
		return "", err
	}
	return link, nil
}

func fetchWhatsAppInviteFromEvolution(ctx context.Context, baseURL, apiKey, instance, groupJID string) (string, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/") + "/group/inviteCode/" + url.PathEscape(instance))
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("groupJid", groupJID)
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("apiKey", apiKey)

	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("evolution inviteCode %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var parsed struct {
		InviteCode string `json:"inviteCode"`
		InviteURL  string `json:"inviteUrl"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.InviteURL != "" {
		return parsed.InviteURL, nil
	}
	if parsed.InviteCode != "" {
		return "https://chat.whatsapp.com/" + parsed.InviteCode, nil
	}
	return "", fmt.Errorf("inviteCode vazio na resposta Evolution")
}
