package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"time"
)

type QRProvider interface {
	GetQRCode(ctx context.Context) (string, error)
}

type AccountsHandler struct {
	store store.Store
}

func NewAccounts(st store.Store) *AccountsHandler {
	return &AccountsHandler{store: st}
}

func (h *AccountsHandler) ListWA(w http.ResponseWriter, r *http.Request) {
	accs, err := h.store.ListWAAccounts()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if accs == nil {
		accs = []models.WAAccount{}
	}

	// Enriquece o status de cada conta com o valor real da Evolution (paralelo, timeout 2s)
	cfg, _ := h.store.GetConfig()
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	for i := range accs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			a := &accs[i]
			baseURL, apiKey, instance := a.BaseURL.String, a.APIKey.String, a.Instance.String
			if !a.BaseURL.Valid || baseURL == "" {
				if cfg.WABaseURL.Valid {
					baseURL = cfg.WABaseURL.String
				}
				if cfg.WAApiKey.Valid {
					apiKey = cfg.WAApiKey.String
				}
				if cfg.WAInstance.Valid {
					instance = cfg.WAInstance.String
				}
			}
			if baseURL == "" {
				return
			}
			evo := newEvolutionClient(baseURL, apiKey, instance)
			status, err := evo.getStatus(ctx)
			if err != nil {
				return
			}
			if status == "connected" {
				a.Status = "connected"
				a.Active = true
				_ = h.store.UpdateWAAccount(*a)
			} else if a.Status == "connected" {
				a.Status = "disconnected"
				_ = h.store.UpdateWAAccount(*a)
			}
		}(i)
	}
	wg.Wait()

	writeJSON(w, http.StatusOK, accs)
}

func (h *AccountsHandler) GetWA(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	a, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

type waAccountRequest struct {
	Name        string `json:"name"`
	Provider    string `json:"provider"`
	BaseURL     string `json:"base_url"`
	APIKey      string `json:"api_key"`
	Instance    string `json:"instance"`
	GroupPrefix string `json:"group_prefix"`
	Role        string `json:"role"`
	DailyLimit  int    `json:"daily_limit"`
	Active      bool   `json:"active"`
}

func (h *AccountsHandler) CreateWA(w http.ResponseWriter, r *http.Request) {
	var req waAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := waAccountFromReq(req)
	id, err := h.store.CreateWAAccount(a)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.ID = id
	slog.Info("conta WA criada", "id", id, "name", a.Name, "provider", a.Provider)
	writeJSON(w, http.StatusCreated, a)
}

func (h *AccountsHandler) UpdateWA(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req waAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := waAccountFromReq(req)
	a.ID = id
	if err := h.store.UpdateWAAccount(a); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *AccountsHandler) DeleteWA(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteWAAccount(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccountsHandler) WAStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "account not found")
		return
	}
	baseURL, apiKey, instance := acc.BaseURL.String, acc.APIKey.String, acc.Instance.String
	if !acc.BaseURL.Valid || baseURL == "" {
		cfg, _ := h.store.GetConfig()
		if cfg.WABaseURL.Valid { baseURL = cfg.WABaseURL.String }
		if cfg.WAApiKey.Valid && apiKey == "" { apiKey = cfg.WAApiKey.String }
		if cfg.WAInstance.Valid && instance == "" { instance = cfg.WAInstance.String }
	}
	if baseURL == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "STOPPED"})
		return
	}
	evo := newEvolutionClient(baseURL, apiKey, instance)
	status, err := evo.getStatus(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "STOPPED", "error": err.Error()})
		return
	}
	// Mapeia estados da Evolution para o formato do frontend
	mapped := map[string]string{
		"open":          "WORKING",
		"close":         "STOPPED",
		"connecting":    "SCAN_QR_CODE",
		"qrcode":        "SCAN_QR_CODE",
		"SCAN_QR_CODE":  "SCAN_QR_CODE",
		"disconnected":  "STOPPED",
		"disconnecting": "STOPPED",
	}
	if s, ok := mapped[status]; ok {
		status = s
	}

	// Atualiza o campo `status` no banco para que a página Grupos detecte corretamente
	dbStatus := acc.Status
	if status == "WORKING" && dbStatus != "connected" {
		acc.Status = "connected"
		_ = h.store.UpdateWAAccount(acc)
		slog.Info("conta WA conectada", "id", acc.ID, "name", acc.Name)
	} else if (status == "STOPPED" || status == "SCAN_QR_CODE") && dbStatus == "connected" {
		acc.Status = "disconnected"
		_ = h.store.UpdateWAAccount(acc)
		slog.Warn("conta WA desconectada", "id", acc.ID, "name", acc.Name, "evolution_status", status)
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

// Cache de grupos por accountID — evita timeout do Cloudflare (30s)
var waGroupsCache sync.Map // int64 → []groupView

type groupView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Size int    `json:"size"`
}

// WAGroups lista os grupos WA via Evolution API com cache em memória.
func (h *AccountsHandler) WAGroups(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "account not found")
		return
	}
	baseURL, apiKey, instance := acc.BaseURL.String, acc.APIKey.String, acc.Instance.String
	if !acc.BaseURL.Valid || baseURL == "" {
		cfg, _ := h.store.GetConfig()
		if cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
		if cfg.WAApiKey.Valid {
			apiKey = cfg.WAApiKey.String
		}
		if cfg.WAInstance.Valid {
			instance = cfg.WAInstance.String
		}
	}
	if baseURL == "" {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	evo := newEvolutionClient(baseURL, apiKey, instance)

	// Retorna cache imediatamente (evita timeout do Cloudflare)
	if cached, ok := waGroupsCache.Load(id); ok {
		writeJSON(w, http.StatusOK, cached)
		// Refresh em background se cache tiver mais de 5min
		go func() {
			groups, err := evo.getGroups(context.Background())
			if err == nil {
				waGroupsCache.Store(id, mapGroups(groups))
			}
		}()
		return
	}

	// Primeiro request: dispara busca em background e retorna [] imediatamente
	waGroupsCache.Store(id, []groupView{}) // placeholder vazio
	go func() {
		groups, err := evo.getGroups(context.Background())
		if err == nil && groups != nil {
			waGroupsCache.Store(id, mapGroups(groups))
		}
	}()
	writeJSON(w, http.StatusOK, []groupView{})
}

func mapGroups(groups []map[string]any) []groupView {
	out := make([]groupView, 0, len(groups))
	for _, g := range groups {
		gid, _ := g["id"].(string)
		if gid == "" {
			gid, _ = g["groupJid"].(string)
		}
		name, _ := g["subject"].(string)
		if name == "" {
			name, _ = g["name"].(string)
		}
		size := 0
		if sv, ok := g["size"].(float64); ok {
			size = int(sv)
		}
		if gid != "" {
			out = append(out, groupView{ID: gid, Name: name, Size: size})
		}
	}
	return out
}

// WACreateGroup cria um grupo WA via Evolution API.
func (h *AccountsHandler) WACreateGroup(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeBody(r, &body); err != nil || body.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "account not found")
		return
	}
	baseURL, apiKey, instance := acc.BaseURL.String, acc.APIKey.String, acc.Instance.String
	if !acc.BaseURL.Valid || baseURL == "" {
		cfg, _ := h.store.GetConfig()
		if cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
		if cfg.WAApiKey.Valid {
			apiKey = cfg.WAApiKey.String
		}
		if cfg.WAInstance.Valid {
			instance = cfg.WAInstance.String
		}
	}
	evo := newEvolutionClient(baseURL, apiKey, instance)
	result, err := evo.createGroup(r.Context(), body.Name)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// WAStartSession cria/inicializa a instância na Evolution API e aguarda QR.
func (h *AccountsHandler) WAStartSession(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "account not found")
		return
	}

	// Se a conta não tem URL própria, usa o AppConfig global
	baseURL, apiKey, instance := acc.BaseURL.String, acc.APIKey.String, acc.Instance.String
	if !acc.BaseURL.Valid || baseURL == "" {
		cfg, _ := h.store.GetConfig()
		if cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
		if cfg.WAApiKey.Valid && apiKey == "" {
			apiKey = cfg.WAApiKey.String
		}
		if cfg.WAInstance.Valid && instance == "" {
			instance = cfg.WAInstance.String
		}
	}

	if baseURL == "" {
		writeErr(w, http.StatusUnprocessableEntity, "Evolution URL não configurada")
		return
	}

	evo := newEvolutionClient(baseURL, apiKey, instance)
	if err := evo.createInstance(r.Context()); err != nil {
		// Log mas não falha — instância pode já existir com resposta não-409
		slog.Warn("createInstance error (continuando)", "err", err, "instance", instance)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "STARTING"})
}

func (h *AccountsHandler) WAQR(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	acc, err := h.store.GetWAAccount(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	baseURL, apiKey, instance := acc.BaseURL.String, acc.APIKey.String, acc.Instance.String
	if !acc.BaseURL.Valid || baseURL == "" {
		cfg, _ := h.store.GetConfig()
		if cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
		if cfg.WAApiKey.Valid {
			apiKey = cfg.WAApiKey.String
		}
		if cfg.WAInstance.Valid {
			instance = cfg.WAInstance.String
		}
	}

	if baseURL == "" {
		http.Error(w, "not configured", http.StatusUnprocessableEntity)
		return
	}

	evo := newEvolutionClient(baseURL, apiKey, instance)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	refreshURL := r.URL.Path

	qrJSON, err := evo.getQRCode(r.Context())
	if err != nil {
		fmt.Fprintf(w, `<!DOCTYPE html><html><head>
<script>setTimeout(()=>location.reload(),5000)</script>
</head><body style="margin:0;background:#111;color:#c44;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;gap:8px;padding:16px;text-align:center">
<p>Erro ao conectar na Evolution API</p>
<p style="font-size:11px;color:#888">%s</p>
<p style="font-size:11px">(<a href="%s" style="color:#555">tentar novamente</a>)</p>
</body></html>`, err.Error(), refreshURL)
		return
	}

	// Extrai base64 do JSON — suporta {base64:"..."} e {qrcode:{base64:"..."}}
	var qrBody map[string]any
	_ = json.Unmarshal([]byte(qrJSON), &qrBody)
	base64QR, _ := qrBody["base64"].(string)
	if base64QR == "" {
		if nested, ok := qrBody["qrcode"].(map[string]any); ok {
			base64QR, _ = nested["base64"].(string)
		}
	}

	if base64QR != "" {
		fmt.Fprintf(w, `<!DOCTYPE html><html><head>
<script>setTimeout(()=>location.reload(),20000)</script>
</head><body style="margin:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:8px">
<img src="%s" style="max-width:90%%;max-height:90%%;object-fit:contain"/>
<p style="color:#666;font-size:11px;font-family:sans-serif">Atualiza em 20s · <a href="%s" style="color:#555">agora</a></p>
</body></html>`, base64QR, refreshURL)
	} else {
		// Mostrar o JSON bruto para diagnóstico
		preview := qrJSON
		if len(preview) > 200 { preview = preview[:200] + "..." }
		fmt.Fprintf(w, `<!DOCTYPE html><html><head>
<script>setTimeout(()=>location.reload(),4000)</script>
</head><body style="margin:0;background:#111;color:#888;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;gap:8px;padding:16px;text-align:center">
<p>Aguardando QR code...</p>
<p style="font-size:10px;color:#555;word-break:break-all;max-width:300px">%s</p>
<p style="font-size:11px">(<a href="%s" style="color:#555">atualizar agora</a>)</p>
</body></html>`, preview, refreshURL)
	}
}

// WAHealth verifica se a Evolution API está acessível — retorna {online, url, version?, error?}.
func (h *AccountsHandler) WAHealth(w http.ResponseWriter, r *http.Request) {
	// Tenta pegar URL da primeira conta WA ativa, depois do AppConfig
	var baseURL string
	accs, _ := h.store.ListWAAccounts()
	for _, a := range accs {
		if a.Active && a.BaseURL.Valid && a.BaseURL.String != "" {
			baseURL = a.BaseURL.String
			break
		}
	}
	if baseURL == "" {
		cfg, err := h.store.GetConfig()
		if err == nil && cfg.WABaseURL.Valid {
			baseURL = cfg.WABaseURL.String
		}
	}
	if baseURL == "" {
		writeJSON(w, http.StatusOK, map[string]any{"online": false, "error": "Nenhuma URL configurada"})
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), "GET", strings.TrimRight(baseURL, "/")+"/", nil)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"online": false, "url": baseURL, "error": err.Error()})
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"online": false, "url": baseURL, "error": err.Error()[:100]})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 {
		var body map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&body)
		version, _ := body["version"].(string)
		writeJSON(w, http.StatusOK, map[string]any{"online": true, "url": baseURL, "version": version})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"online": false, "url": baseURL, "status": resp.StatusCode})
}

func (h *AccountsHandler) ListTG(w http.ResponseWriter, r *http.Request) {
	accs, err := h.store.ListTGAccounts()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if accs == nil {
		accs = []models.TGAccount{}
	}
	writeJSON(w, http.StatusOK, accs)
}

type tgAccountRequest struct {
	Name        string `json:"name"`
	BotToken    string `json:"bot_token"`
	BotUsername string `json:"bot_username"`
	GroupPrefix string `json:"group_prefix"`
	Role        string `json:"role"`
	DailyLimit  int    `json:"daily_limit"`
	Active      bool   `json:"active"`
}

func (h *AccountsHandler) CreateTG(w http.ResponseWriter, r *http.Request) {
	var req tgAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := tgAccountFromReq(req)
	id, err := h.store.CreateTGAccount(a)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.ID = id
	writeJSON(w, http.StatusCreated, a)
}

func (h *AccountsHandler) UpdateTG(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req tgAccountRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a := tgAccountFromReq(req)
	a.ID = id
	if err := h.store.UpdateTGAccount(a); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *AccountsHandler) DeleteTG(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteTGAccount(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AccountsHandler) ListTGChats(w http.ResponseWriter, r *http.Request) {
	chats, err := h.store.ListTelegramChats()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if chats == nil {
		chats = []models.TelegramChat{}
	}
	writeJSON(w, http.StatusOK, chats)
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
// Mini Evolution client para status (evita dependência circular com adapters)
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

func (e *evoClient) getQRCode(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		e.baseURL+"/instance/connect/"+e.instance, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("apiKey", e.apiKey)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body), nil
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

func (e *evoClient) createInstance(ctx context.Context) error {
	body := map[string]any{
		"instanceName": e.instance,
		"integration":  "WHATSAPP-BAILEYS",
	}
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST",
		e.baseURL+"/instance/create", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apiKey", e.apiKey)
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	// 409 = já existe — ok
	if resp.StatusCode >= 400 && resp.StatusCode != 409 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("evolution create: status %d — %s", resp.StatusCode, string(b))
	}
	return nil
}

func waAccountFromReq(req waAccountRequest) models.WAAccount {
	active := req.Active
	if !active {
		active = true // default ativo — frontend não manda esse campo
	}
	a := models.WAAccount{
		Name:       req.Name,
		Provider:   req.Provider,
		Status:     "disconnected",
		Active:     active,
		Role:       req.Role,
		DailyLimit: req.DailyLimit,
		SentToday:  0, // reset on creation
	}
	if a.Provider == "" {
		a.Provider = "evolution"
	}
	if req.BaseURL != "" {
		a.BaseURL = models.NullString{NullString: sql.NullString{String: req.BaseURL, Valid: true}}
	}
	if req.APIKey != "" {
		a.APIKey = models.NullString{NullString: sql.NullString{String: req.APIKey, Valid: true}}
	}
	if req.Instance != "" {
		a.Instance = models.NullString{NullString: sql.NullString{String: req.Instance, Valid: true}}
	}
	if req.GroupPrefix != "" {
		a.GroupPrefix = models.NullString{NullString: sql.NullString{String: req.GroupPrefix, Valid: true}}
	}
	return a
}

func tgAccountFromReq(req tgAccountRequest) models.TGAccount {
	a := models.TGAccount{
		Name:       req.Name,
		Active:     req.Active,
		Role:       req.Role,
		DailyLimit: req.DailyLimit,
		SentToday:  0, // reset on creation
	}
	if req.BotToken != "" {
		a.BotToken = models.NullString{NullString: sql.NullString{String: req.BotToken, Valid: true}}
	}
	if req.BotUsername != "" {
		a.BotUsername = models.NullString{NullString: sql.NullString{String: req.BotUsername, Valid: true}}
	}
	if req.GroupPrefix != "" {
		a.GroupPrefix = models.NullString{NullString: sql.NullString{String: req.GroupPrefix, Valid: true}}
	}
	return a
}
