package handlers

import (
	"net/http"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type AffiliateProgramsHandler struct {
	store store.Store
}

func NewAffiliateProgramsHandler(st store.Store) *AffiliateProgramsHandler {
	return &AffiliateProgramsHandler{store: st}
}

// List retorna todos os programas de afiliado.
func (h *AffiliateProgramsHandler) List(w http.ResponseWriter, r *http.Request) {
	programs, err := h.store.ListAffiliatePrograms(nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar programas")
		return
	}
	writeJSON(w, http.StatusOK, programs)
}

// Get retorna um programa de afiliado por ID.
func (h *AffiliateProgramsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetAffiliateProgram(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "programa nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// Create cria um novo programa de afiliado.
func (h *AffiliateProgramsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name" validate:"required"`
		Marketplace string `json:"marketplace" validate:"required"`
		Active      *bool  `json:"active"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	p := models.AffiliateProgram{
		Name:        req.Name,
		Marketplace: req.Marketplace,
		Active:      active,
		Credentials: []byte("{}"),
		Rules:       []byte("{}"),
		Postback:    []byte("{}"),
	}
	id, err := h.store.CreateAffiliateProgram(p)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar programa")
		return
	}
	p.ID = id
	writeJSON(w, http.StatusCreated, p)
}

// Delete deleta um programa de afiliado.
func (h *AffiliateProgramsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteAffiliateProgram(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// BuildLink constrói o link de afiliado para um produto.
//
// POST /api/affiliates/build-link
func (h *AffiliateProgramsHandler) BuildLink(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductURL  string `json:"product_url" validate:"required"`
		Marketplace string `json:"marketplace" validate:"required"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	programs, err := h.store.ListAffiliateProgramsByMarketplace(req.Marketplace)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar programas")
		return
	}
	link, programName, err := affiliates.BuildLink(req.ProductURL, req.Marketplace, programs)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao construir link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": link, "program": programName})
}
