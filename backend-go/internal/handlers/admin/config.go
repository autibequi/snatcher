package admin

import (
	"net/http"
	"snatcher/backendv2/internal/store"
)

type ConfigHandler struct {
	store store.Store
}

func NewConfig(st store.Store) *ConfigHandler {
	return &ConfigHandler{store: st}
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
	writeJSON(w, http.StatusOK, cfg)
}
