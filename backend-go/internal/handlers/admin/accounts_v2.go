package admin

import (
	"context"
	"net/http"
	"os"

	"snatcher/backendv2/internal/adapters"
	"snatcher/backendv2/internal/store"
)

type AccountsV2Handler struct {
	store store.Store
}

func NewAccountsV2Handler(st store.Store) *AccountsV2Handler {
	return &AccountsV2Handler{store: st}
}

// POST /api/admin/modems/{id}/accounts
func (h *AccountsV2Handler) Create(w http.ResponseWriter, r *http.Request) {
	modemID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "modem id inválido")
		return
	}
	var req struct {
		Phone string `json:"phone"`
		Quota int    `json:"daily_send_quota"`
	}
	if err := decodeBody(r, &req); err != nil || req.Phone == "" {
		writeErr(w, http.StatusBadRequest, "phone obrigatório")
		return
	}
	id, err := h.store.CreateAccountV2(req.Phone, modemID, req.Quota)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar conta: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// DELETE /api/admin/accounts/{id}
func (h *AccountsV2Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "id inválido")
		return
	}
	if err := h.store.DeleteAccountV2(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar conta")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// PATCH /api/admin/accounts/{id}
func (h *AccountsV2Handler) Update(w http.ResponseWriter, r *http.Request) {
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
	existing, err := h.store.GetAccountV2(id)
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
	if err := h.store.UpdateAccountV2(id, status, quota); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar conta")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// WAQRCode retorna o QR code base64 para conectar uma conta WhatsApp via Evolution API.
// GET /api/admin/modems/{id}/qrcode
func (h *AccountsV2Handler) WAQRCode(w http.ResponseWriter, r *http.Request) {
	baseURL := os.Getenv("EVOLUTION_URL")
	apiKey := os.Getenv("EVOLUTION_API_KEY")
	instance := os.Getenv("EVOLUTION_INSTANCE")
	if instance == "" {
		instance = "default"
	}
	if baseURL == "" {
		writeErr(w, http.StatusServiceUnavailable, "Evolution API não configurada")
		return
	}
	evo := adapters.NewEvolutionWithAccount(0, baseURL, apiKey, instance)
	qr, err := evo.GetQRCode(context.Background())
	if err != nil {
		writeErr(w, http.StatusBadGateway, "erro ao obter QR code: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"qr_base64": qr, "instance": instance})
}

// WAConnectionStatus retorna o estado de conexão da instância Evolution.
// GET /api/admin/modems/{id}/connection-status
func (h *AccountsV2Handler) WAConnectionStatus(w http.ResponseWriter, r *http.Request) {
	baseURL := os.Getenv("EVOLUTION_URL")
	apiKey := os.Getenv("EVOLUTION_API_KEY")
	instance := os.Getenv("EVOLUTION_INSTANCE")
	if instance == "" {
		instance = "default"
	}
	if baseURL == "" {
		writeErr(w, http.StatusServiceUnavailable, "Evolution API não configurada")
		return
	}
	evo := adapters.NewEvolutionWithAccount(0, baseURL, apiKey, instance)
	status, err := evo.GetStatus(context.Background())
	if err != nil {
		writeErr(w, http.StatusBadGateway, "erro ao obter status: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}
