package admin

import (
	"fmt"
	"net/http"

	"github.com/jmoiron/sqlx"
	store "snatcher/backendv2/internal/repositories"
)

type ConfigHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewConfig(st store.Store) *ConfigHandler {
	return &ConfigHandler{store: st}
}

// NewConfigWithDB cria ConfigHandler com acesso ao banco (necessário para full-auto-toggle)
func NewConfigWithDB(st store.Store, db *sqlx.DB) *ConfigHandler {
	return &ConfigHandler{store: st, db: db}
}

func (h *ConfigHandler) Get(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (h *ConfigHandler) Update(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := decodeBody(r, &cfg); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	cfg.ID = 1
	if err := h.store.UpdateConfig(cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.store.ApplyGlobalDailyLimitToAccounts(cfg.DailyLimitPerAccount); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

// ToggleFullAuto POST /api/config/full-auto-toggle
// Ativa/desativa full_auto_mode e aprova ou rejeita dispatches pendentes.
func (h *ConfigHandler) ToggleFullAuto(w http.ResponseWriter, r *http.Request) {
	if h.db == nil {
		writeErr(w, http.StatusInternalServerError, "db not initialized")
		return
	}

	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Toggle: inverte o estado
	newState := !cfg.FullAutoMode

	// Executa UPDATE no banco
	_, err = h.db.ExecContext(r.Context(), `UPDATE appconfig SET full_auto_mode = $1 WHERE id = 1`, newState)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, fmt.Sprintf("UPDATE appconfig: %v", err))
		return
	}

	// No v2 não há fila de pending_approval — a tabela legada 'dispatches' foi removida
	// (migration drop_v1_dispatch_wa_product). O selection.tick enfileira direto em
	// send_queue; full_auto_mode é apenas um indicador exibido no dashboard. O UPDATE
	// antigo em 'dispatches' causava 500 (tabela inexistente).
	result := map[string]any{
		"full_auto_mode": newState,
	}
	if newState {
		result["message"] = "Full auto mode ativado."
	} else {
		result["message"] = "Full auto mode desativado."
	}

	writeJSON(w, http.StatusOK, result)
}
