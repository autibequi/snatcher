package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"time"
)

// AccountsHandler expõe operações de contas de envio.
// Os handlers de CRUD waaccount (ListWA, CreateWA, UpdateWA, DeleteWA,
// WAStatus, WAStartSession, WAQR, WAHealth, WAGroups, WACreateGroup) foram
// removidos em F08. Use /api/admin/senders/* para accounts v2.
type AccountsHandler struct {
	store store.Store
}

func NewAccounts(st store.Store) *AccountsHandler {
	return &AccountsHandler{store: st}
}

func (h *AccountsHandler) ListGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := h.store.ListGroups()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if groups == nil {
		groups = []models.Group{}
	}
	writeJSON(w, http.StatusOK, groups)
}

// ---------------------------------------------------------------------------
// Mini Evolution client para status (usado por groups.go no mesmo pacote)
// ---------------------------------------------------------------------------

type evoClient struct{ baseURL, apiKey, instance string }

func newEvolutionClient(baseURL, apiKey, instance string) *evoClient {
	return &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
}

func (e *evoClient) getStatus(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		e.baseURL+"/instance/connectionState/"+e.instance, nil)
	if err != nil {
		return "error", err
	}
	req.Header.Set("apiKey", e.apiKey)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "disconnected", err
	}
	defer resp.Body.Close()
	var body struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "error", err
	}
	switch body.Instance.State {
	case "open":
		return "connected", nil
	case "close":
		return "disconnected", nil
	default:
		return body.Instance.State, nil
	}
}

func (e *evoClient) getGroups(ctx context.Context) ([]map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		e.baseURL+"/group/fetchAllGroups/"+e.instance+"?getParticipants=true", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apiKey", e.apiKey)
	// Timeout alto — muitos grupos com participantes pode demorar
	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var groups []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&groups); err != nil {
		return nil, err
	}
	return groups, nil
}

// findGroupParticipants chama GET /group/participants/{instance}?groupJid=...
// (Evolution v2); fetchAllGroups nem sempre inclui o array participants na resposta.
func (e *evoClient) findGroupParticipants(ctx context.Context, groupJID string) ([]map[string]any, error) {
	groupJID = strings.TrimSpace(groupJID)
	if groupJID == "" {
		return nil, fmt.Errorf("groupJid vazio")
	}
	base := strings.TrimRight(e.baseURL, "/")
	u, err := url.Parse(base + "/group/participants/" + url.PathEscape(e.instance))
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("groupJid", groupJID)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("evolution participants %s: %s", resp.Status, strings.TrimSpace(string(b)))
	}
	var outer map[string]any
	if err := json.Unmarshal(b, &outer); err != nil {
		return nil, err
	}
	raw, ok := outer["participants"].([]any)
	if !ok || len(raw) == 0 {
		return nil, nil
	}
	out := make([]map[string]any, 0, len(raw))
	for _, p := range raw {
		pm, ok := p.(map[string]any)
		if ok {
			out = append(out, pm)
		}
	}
	return out, nil
}

func (e *evoClient) getOwnNumber(ctx context.Context) string {
	req, err := http.NewRequestWithContext(ctx, "GET",
		e.baseURL+"/instance/fetchInstances?instanceName="+e.instance, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var data []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || len(data) == 0 {
		return ""
	}
	for _, key := range []string{"ownerJid", "number"} {
		if v, ok := data[0][key].(string); ok && v != "" {
			if idx := strings.Index(v, "@"); idx != -1 {
				return v[:idx]
			}
			return v
		}
	}
	return ""
}

func (e *evoClient) createGroup(ctx context.Context, name string) (map[string]any, error) {
	// Evolution exige pelo menos 1 participante — usa o próprio número
	participants := []string{}
	if own := e.getOwnNumber(ctx); own != "" {
		participants = []string{own}
	}
	body := map[string]any{
		"subject":      name,
		"participants": participants,
	}
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST",
		e.baseURL+"/group/create/"+e.instance, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("evolution create group: %v", result)
	}
	return result, nil
}

// getGroupInviteCode busca o código de convite (e link) de um grupo via Evolution.
func (e *evoClient) getGroupInviteCode(ctx context.Context, groupJID string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		e.baseURL+"/group/inviteCode/"+e.instance+"?groupJid="+groupJID, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("evolution inviteCode %d: %s", resp.StatusCode, string(body))
	}
	var body struct {
		InviteCode string `json:"inviteCode"`
		InviteUrl  string `json:"inviteUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	if body.InviteUrl != "" {
		return body.InviteUrl, nil
	}
	if body.InviteCode != "" {
		return "https://chat.whatsapp.com/" + body.InviteCode, nil
	}
	return "", fmt.Errorf("inviteCode vazio na resposta")
}

// updateGroupSubject altera o assunto (nome visível) do grupo no WhatsApp via Evolution.
func (e *evoClient) updateGroupSubject(ctx context.Context, groupJID, subject string) error {
	b, err := json.Marshal(map[string]any{"subject": subject})
	if err != nil {
		return err
	}
	u := fmt.Sprintf("%s/group/updateGroupSubject/%s?groupJid=%s", e.baseURL, e.instance, url.QueryEscape(groupJID))
	req, err := http.NewRequestWithContext(ctx, "POST", u, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 25 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("evolution updateGroupSubject %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// updateParticipant executa add | remove | promote | demote em participantes (números com DDI, sem sufixo @).
func (e *evoClient) updateParticipant(ctx context.Context, groupJID, action string, participants []string) error {
	b, err := json.Marshal(map[string]any{"action": action, "participants": participants})
	if err != nil {
		return err
	}
	u := fmt.Sprintf("%s/group/updateParticipant/%s?groupJid=%s", e.baseURL, e.instance, url.QueryEscape(groupJID))
	req, err := http.NewRequestWithContext(ctx, "POST", u, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 45 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("evolution updateParticipant %s %d: %s", action, resp.StatusCode, string(body))
	}
	return nil
}

