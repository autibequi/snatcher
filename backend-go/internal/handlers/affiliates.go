package handlers

import (
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type AffiliatesHandler struct {
	store store.Store
}

func NewAffiliates(st store.Store) *AffiliatesHandler {
	return &AffiliatesHandler{store: st}
}

// List retorna todos os afiliados
//
//	@Summary      Listar afiliados
//	@Description  Retorna todos os afiliados, opcionalmente filtrados por source.
//	@Tags         affiliates
//	@Param        source_id  query  string  false  "Filter by source ID"
//	@Produce      json
//	@Success      200  {array}   models.Affiliate
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/affiliates [get]
func (h *AffiliatesHandler) List(w http.ResponseWriter, r *http.Request) {
	sourceID := r.URL.Query().Get("source_id")
	var filterSourceID *string
	if sourceID != "" {
		filterSourceID = &sourceID
	}

	affiliates, err := h.store.ListAffiliates(filterSourceID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if affiliates == nil {
		affiliates = []models.Affiliate{}
	}
	writeJSON(w, http.StatusOK, affiliates)
}

// Get retorna um afiliado específico
//
//	@Summary      Obter afiliado
//	@Description  Retorna um afiliado pelo ID.
//	@Tags         affiliates
//	@Param        id  path  int64  true  "Affiliate ID"
//	@Produce      json
//	@Success      200  {object}  models.Affiliate
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/affiliates/{id} [get]
func (h *AffiliatesHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	aff, err := h.store.GetAffiliate(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	writeJSON(w, http.StatusOK, aff)
}

// Create cria um novo afiliado
//
//	@Summary      Criar afiliado
//	@Description  Cria um novo afiliado.
//	@Tags         affiliates
//	@Param        body  body  object{source_id=string,name=string,tracking_id=string,active=bool}  true  "Affiliate data"
//	@Produce      json
//	@Success      201  {object}  models.Affiliate
//	@Failure      400  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/affiliates [post]
func (h *AffiliatesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceID   string `json:"source_id" validate:"required"`
		Name       string `json:"name" validate:"required"`
		TrackingID string `json:"tracking_id" validate:"required"`
		Active     bool   `json:"active"`
	}

	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request")
		return
	}

	aff := models.Affiliate{
		SourceID:   req.SourceID,
		Name:       req.Name,
		TrackingID: req.TrackingID,
		Active:     req.Active,
	}

	id, err := h.store.CreateAffiliate(aff)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	aff.ID = id
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, http.StatusCreated, aff)
}

// Update atualiza um afiliado existente
//
//	@Summary      Atualizar afiliado
//	@Description  Atualiza um afiliado existente.
//	@Tags         affiliates
//	@Param        id    path  int64  true  "Affiliate ID"
//	@Param        body  body  object{source_id=string,name=string,tracking_id=string,active=bool}  true  "Updated data"
//	@Produce      json
//	@Success      200  {object}  models.Affiliate
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/affiliates/{id} [put]
func (h *AffiliatesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req struct {
		SourceID   string `json:"source_id" validate:"required"`
		Name       string `json:"name" validate:"required"`
		TrackingID string `json:"tracking_id" validate:"required"`
		Active     bool   `json:"active"`
	}

	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request")
		return
	}

	// Verify exists
	_, err := h.store.GetAffiliate(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	aff := models.Affiliate{
		ID:         id,
		SourceID:   req.SourceID,
		Name:       req.Name,
		TrackingID: req.TrackingID,
		Active:     req.Active,
	}

	if err := h.store.UpdateAffiliate(aff); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, aff)
}

// Delete deleta um afiliado
//
//	@Summary      Deletar afiliado
//	@Description  Deleta um afiliado.
//	@Tags         affiliates
//	@Param        id  path  int64  true  "Affiliate ID"
//	@Success      204
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/affiliates/{id} [delete]
func (h *AffiliatesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Verify exists
	_, err := h.store.GetAffiliate(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	if err := h.store.DeleteAffiliate(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
