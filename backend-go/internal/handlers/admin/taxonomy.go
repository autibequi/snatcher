package admin

import (
	"net/http"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type TaxonomyHandler struct {
	store store.Store
}

func NewTaxonomyHandler(st store.Store) *TaxonomyHandler {
	return &TaxonomyHandler{store: st}
}

// List retorna entradas da taxonomia (categorias e/ou marcas).
// GET /api/taxonomy?type=category|brand (type opcional)
func (h *TaxonomyHandler) List(w http.ResponseWriter, r *http.Request) {
	taxType := r.URL.Query().Get("type")
	if taxType != "" && taxType != "category" && taxType != "brand" {
		writeErr(w, http.StatusBadRequest, "type must be 'category' or 'brand'")
		return
	}
	out, err := h.store.ListTaxonomy(taxType)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if out == nil {
		out = []models.Taxonomy{}
	}
	writeJSON(w, http.StatusOK, out)
}
