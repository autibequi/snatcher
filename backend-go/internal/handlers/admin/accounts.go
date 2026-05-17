package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"snatcher/backendv2/internal/services/messaging"
	store "snatcher/backendv2/internal/repositories"
)

// AccountsHandler expõe operações de contas WA v2 (CRUD + WA connect via messaging.Gateway).
type AccountsHandler struct {
	store       store.Store
	// msgRegistry permite obter o Gateway WA/TG sem acoplamento ao adapter Evolution concreto.
	msgRegistry *messaging.Registry
}

// NewAccountsHandler cria um AccountsHandler com store e registry de mensageria.
func NewAccountsHandler(st store.Store, reg *messaging.Registry) *AccountsHandler {
	return &AccountsHandler{store: st, msgRegistry: reg}
}

// POST /api/admin/modems/{id}/accounts
func (h *AccountsHandler) Create(w http.ResponseWriter, r *http.Request) {
	modemID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "modem id inválido")
		return
	}
	var req struct {
		Phone    string `json:"phone"`
		Nickname string `json:"nickname"`
		Quota    int    `json:"daily_send_quota"`
	}
	if err := decodeBody(r, &req); err != nil || req.Phone == "" {
		writeErr(w, http.StatusBadRequest, "phone obrigatório")
		return
	}
	id, err := h.store.CreateAccount(req.Phone, req.Nickname, modemID, req.Quota)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar conta: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// DELETE /api/admin/accounts/{id}
func (h *AccountsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	if err := h.store.DeleteAccount(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar conta")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// PATCH /api/admin/accounts/{id}
func (h *AccountsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	var req struct {
		Status string `json:"status"`
		Quota  int    `json:"daily_send_quota"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	existing, err := h.store.GetAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "conta não encontrada")
		return
	}
	status := existing.Status
	if req.Status != "" {
		status = req.Status
	}
	quota := existing.DailySendQuota
	if req.Quota > 0 {
		quota = req.Quota
	}
	if err := h.store.UpdateAccount(id, status, quota); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar conta")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// WAQRCode retorna o QR code base64 para conectar uma conta WhatsApp via messaging.Gateway.
// GET /api/admin/modems/{id}/qrcode
func (h *AccountsHandler) WAQRCode(w http.ResponseWriter, r *http.Request) {
	gw, instance, err := h.resolveWAGateway()
	if err != nil {
		writeErr(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	// Connect retorna a sessão com o QR code quando a instância está em estado qr_pending.
	session, err := gw.Connect(r.Context(), 0, map[string]string{"instance": instance})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "erro ao obter QR code: "+err.Error())
		return
	}
	if session.QRCode == "" {
		writeErr(w, http.StatusBadGateway, "QR code não disponível — instância pode já estar conectada")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"qr_base64": session.QRCode, "instance": instance})
}

// WAConnectionStatus retorna o estado de conexão da instância WhatsApp via messaging.Gateway.
// GET /api/admin/modems/{id}/connection-status
func (h *AccountsHandler) WAConnectionStatus(w http.ResponseWriter, r *http.Request) {
	gw, _, err := h.resolveWAGateway()
	if err != nil {
		writeErr(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	// Health retorna o status de conexão da conta.
	health, err := gw.Health(r.Context(), 0)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "erro ao obter status: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": health.Status})
}

// EvolutionHealth verifica se o gateway WA está acessível e retorna status + instância.
// GET /api/admin/evolution/health — sem expor credenciais ao frontend.
func (h *AccountsHandler) EvolutionHealth(w http.ResponseWriter, r *http.Request) {
	gw, instance, err := h.resolveWAGateway()
	if err != nil {
		// Registry não configurado (sem EVOLUTION_URL) — retorna configured=false sem erro HTTP.
		writeJSON(w, http.StatusOK, map[string]any{
			"configured": false,
			"status":     "not_configured",
			"instance":   "",
		})
		return
	}

	// Health verifica conectividade e retorna o status da instância.
	health, healthErr := gw.Health(r.Context(), 0)

	apiOnline := healthErr == nil
	waStatus := ""
	if healthErr == nil {
		waStatus = health.Status
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"configured": true,
		"api_online": apiOnline,
		"wa_status":  waStatus, // "connected" | "disconnected"
		"instance":   instance,
	})
}

// resolveWAGateway retorna o gateway WhatsApp do registry e o nome da instância configurada.
// O nome da instância é lido da variável de ambiente para compor a resposta ao frontend.
func (h *AccountsHandler) resolveWAGateway() (messaging.Gateway, string, error) {
	if h.msgRegistry == nil {
		return nil, "", fmt.Errorf("Evolution API não configurada")
	}
	gw, err := h.msgRegistry.Get(string(messaging.PlatformWhatsApp))
	if err != nil {
		return nil, "", fmt.Errorf("Evolution API não configurada")
	}
	instance := os.Getenv("EVOLUTION_INSTANCE")
	if instance == "" {
		instance = "default"
	}
	return gw, instance, nil
}

// ---------------------------------------------------------------------------
// Mini Evolution client para operações de grupo (usado por groups.go no mesmo pacote).
// Mantido por encapsular chamadas Evolution-específicas não cobertas pela interface Gateway
// (participantes, criação de grupo, link de convite, promoção de admin).
// ---------------------------------------------------------------------------

type evoClient struct{ baseURL, apiKey, instance string }

// newEvolutionClient cria um cliente leve para a Evolution API sem dependência do adapter completo.
func newEvolutionClient(baseURL, apiKey, instance string) *evoClient {
	return &evoClient{baseURL: baseURL, apiKey: apiKey, instance: instance}
}

// getStatus retorna o estado de conexão da instância ("connected" | "disconnected" | ...).
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

// getGroups retorna todos os grupos da instância com seus participantes.
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

// getOwnNumber retorna o número do dono da instância (sem sufixo @).
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

// createGroup cria um novo grupo WhatsApp via Evolution, usando o próprio número como participante inicial.
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
