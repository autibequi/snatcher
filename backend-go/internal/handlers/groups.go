package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type GroupsHandler struct {
	store store.Store
}

func NewGroupsHandler(st store.Store) *GroupsHandler {
	return &GroupsHandler{store: st}
}

type groupRequest struct {
	ChannelID   int64   `json:"channel_id"   validate:"required"`
	Name        string  `json:"name"         validate:"required"`
	Platform    string  `json:"platform"     validate:"required,oneof=whatsapp telegram"`
	WAAccountID *int64  `json:"wa_account_id"`
	TGAccountID *int64  `json:"tg_account_id"`
	InviteLink  string  `json:"invite_link"`
	JID         string  `json:"jid"`
	Status      string  `json:"status"`
}

func (h *GroupsHandler) List(w http.ResponseWriter, r *http.Request) {
	channelID := int64(0)
	if v := r.URL.Query().Get("channelId"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			channelID = n
		}
	}
	platform := r.URL.Query().Get("platform")
	status := r.URL.Query().Get("status")

	groups, err := h.store.ListRedesignGroups(channelID, platform, status)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar grupos")
		return
	}
	if groups == nil {
		groups = []models.RedesignGroup{}
	}
	writeJSON(w, http.StatusOK, groups)
}

func (h *GroupsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	g, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *GroupsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req groupRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	g := models.RedesignGroup{
		ChannelID:  req.ChannelID,
		Name:       req.Name,
		Platform:   req.Platform,
		InviteLink: models.NullString{NullString: sql.NullString{String: req.InviteLink, Valid: req.InviteLink != ""}},
		JID:        models.NullString{NullString: sql.NullString{String: req.JID, Valid: req.JID != ""}},
		Status:     "active",
		Overrides:  []byte("{}"),
	}
	if req.Status != "" {
		g.Status = req.Status
	}
	if req.WAAccountID != nil {
		g.WAAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.WAAccountID, Valid: true}}
	}
	if req.TGAccountID != nil {
		g.TGAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.TGAccountID, Valid: true}}
	}
	id, err := h.store.CreateRedesignGroup(g)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar grupo")
		return
	}
	g.ID = id
	writeJSON(w, http.StatusCreated, g)
}

func (h *GroupsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	existing, err := h.store.GetRedesignGroup(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "grupo nao encontrado")
		return
	}

	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	if v, ok := patch["name"].(string); ok && v != "" {
		existing.Name = v
	}
	if v, ok := patch["status"].(string); ok && v != "" {
		existing.Status = v
	}
	if v, ok := patch["platform"].(string); ok && v != "" {
		existing.Platform = v
	}
	if v, ok := patch["invite_link"].(string); ok {
		existing.InviteLink = models.NullString{NullString: sql.NullString{String: v, Valid: v != ""}}
	}
	if v, ok := patch["jid"].(string); ok {
		existing.JID = models.NullString{NullString: sql.NullString{String: v, Valid: v != ""}}
	}
	if v, ok := patch["member_count"].(float64); ok {
		existing.MemberCount = int64(v)
	}
	if v, ok := patch["wa_account_id"].(float64); ok {
		existing.WAAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: int64(v), Valid: true}}
	}
	if v, ok := patch["tg_account_id"].(float64); ok {
		existing.TGAccountID = models.NullInt64{NullInt64: sql.NullInt64{Int64: int64(v), Valid: true}}
	}

	if err := h.store.UpdateRedesignGroup(existing); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar grupo")
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

func (h *GroupsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteRedesignGroup(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar grupo")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
