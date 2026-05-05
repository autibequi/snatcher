package admin

import (
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type BroadcastHandler struct {
	store store.Store
}

func NewBroadcast(st store.Store) *BroadcastHandler {
	return &BroadcastHandler{store: st}
}

func (h *BroadcastHandler) List(w http.ResponseWriter, r *http.Request) {
	msgs, err := h.store.ListBroadcasts(50)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if msgs == nil {
		msgs = []models.BroadcastMessage{}
	}
	writeJSON(w, http.StatusOK, msgs)
}

func (h *BroadcastHandler) Create(w http.ResponseWriter, r *http.Request) {
	var b models.BroadcastMessage
	if err := decodeBody(r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if b.ChannelIDs == "" {
		b.ChannelIDs = "all"
	}
	b.Status = "pending"
	id, err := h.store.CreateBroadcast(b)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	b.ID = id
	writeJSON(w, http.StatusCreated, b)
}
