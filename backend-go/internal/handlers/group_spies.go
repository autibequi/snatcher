package handlers

import (
	"database/sql"
	"net/http"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// GroupSpiesHandler expõe CRUD para group_spies.
type GroupSpiesHandler struct {
	store store.Store
}

// NewGroupSpiesHandler cria o handler.
func NewGroupSpiesHandler(st store.Store) *GroupSpiesHandler {
	return &GroupSpiesHandler{store: st}
}

type groupSpyRequest struct {
	GroupName  string `json:"group_name"  validate:"required"`
	Platform   string `json:"platform"    validate:"required,oneof=whatsapp telegram"`
	InviteLink string `json:"invite_link" validate:"required"`
	ReaderWAID *int64 `json:"reader_wa_id"`
	ReaderTGID *int64 `json:"reader_tg_id"`
}

// List godoc
//
//	@Summary     Listar group spies
//	@Tags        crawlers
//	@Produce     json
//	@Param       platform query string false "Filtrar por plataforma (whatsapp|telegram)"
//	@Success     200 {array} models.GroupSpy
//	@Router      /api/crawlers/group-spy [get]
func (h *GroupSpiesHandler) List(w http.ResponseWriter, r *http.Request) {
	platform := r.URL.Query().Get("platform")
	spies, err := h.store.ListGroupSpies(platform, false)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar spies")
		return
	}
	if spies == nil {
		spies = []models.GroupSpy{}
	}
	writeJSON(w, http.StatusOK, spies)
}

// Get godoc
//
//	@Summary     Obter group spy por ID
//	@Tags        crawlers
//	@Produce     json
//	@Param       id path int true "ID do spy"
//	@Success     200 {object} models.GroupSpy
//	@Failure     404 {object} map[string]string
//	@Router      /api/crawlers/group-spy/{id} [get]
func (h *GroupSpiesHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	spy, err := h.store.GetGroupSpy(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "spy nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, spy)
}

// Create godoc
//
//	@Summary     Criar group spy
//	@Tags        crawlers
//	@Accept      json
//	@Produce     json
//	@Param       body body groupSpyRequest true "Dados do spy"
//	@Success     201 {object} models.GroupSpy
//	@Failure     400 {object} map[string]string
//	@Router      /api/crawlers/group-spy [post]
func (h *GroupSpiesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req groupSpyRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	g := models.GroupSpy{
		GroupName:  req.GroupName,
		Platform:   req.Platform,
		InviteLink: req.InviteLink,
		Stats:      []byte("{}"),
	}
	if req.ReaderWAID != nil {
		g.ReaderWAID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.ReaderWAID, Valid: true}}
	}
	if req.ReaderTGID != nil {
		g.ReaderTGID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.ReaderTGID, Valid: true}}
	}
	id, err := h.store.CreateGroupSpy(g)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar spy")
		return
	}
	g.ID = id
	writeJSON(w, http.StatusCreated, g)
}

// Messages godoc
//
//	@Summary     Listar mensagens coletadas de um spy
//	@Tags        crawlers
//	@Produce     json
//	@Param       id path int true "ID do spy"
//	@Success     200 {array} models.SpyMessage
//	@Router      /api/crawlers/group-spy/{id}/messages [get]
func (h *GroupSpiesHandler) Messages(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	msgs, err := h.store.ListSpyMessages(id, 100)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar mensagens")
		return
	}
	writeJSON(w, http.StatusOK, msgs)
}

// Delete godoc
//
//	@Summary     Remover group spy (soft-delete)
//	@Tags        crawlers
//	@Param       id path int true "ID do spy"
//	@Success     204
//	@Failure     400 {object} map[string]string
//	@Router      /api/crawlers/group-spy/{id} [delete]
func (h *GroupSpiesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.SoftDeleteGroupSpy(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar spy")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
