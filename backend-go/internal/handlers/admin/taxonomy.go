package admin

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type TaxonomyHandler struct {
	store store.Store
}

func NewTaxonomyHandler(st store.Store) *TaxonomyHandler {
	return &TaxonomyHandler{store: st}
}

// List retorna entradas da taxonomia (categorias e/ou marcas) aprovadas.
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

// ListPending retorna apenas entradas pendentes (descobertas pelo crawler/LLM).
// GET /api/taxonomy/pending
func (h *TaxonomyHandler) ListPending(w http.ResponseWriter, r *http.Request) {
	out, err := h.store.ListPendingTaxonomy()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if out == nil {
		out = []models.Taxonomy{}
	}
	writeJSON(w, http.StatusOK, out)
}

type taxonomyForm struct {
	Type     string   `json:"type"`
	Name     string   `json:"name"`
	Keywords []string `json:"keywords"`
	Active   *bool    `json:"active"`
}

func slugifyTaxonomy(s string) string {
	out := strings.ToLower(strings.TrimSpace(s))
	out = strings.ReplaceAll(out, " ", "-")
	return out
}

// Create POST /api/taxonomy
func (h *TaxonomyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var f taxonomyForm
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if f.Type != "category" && f.Type != "brand" {
		writeErr(w, http.StatusBadRequest, "type must be 'category' or 'brand'")
		return
	}
	if strings.TrimSpace(f.Name) == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	active := true
	if f.Active != nil {
		active = *f.Active
	}
	t := models.Taxonomy{
		Type:     f.Type,
		Name:     strings.TrimSpace(f.Name),
		Slug:     slugifyTaxonomy(f.Name),
		Keywords: pq.StringArray(f.Keywords),
		Active:   active,
		Status:   "approved",
		Source:   "manual",
	}
	id, err := h.store.CreateTaxonomy(t)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	t.ID = id
	writeJSON(w, http.StatusCreated, t)
}

// Update PATCH /api/taxonomy/{id}
func (h *TaxonomyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var f taxonomyForm
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	active := true
	if f.Active != nil {
		active = *f.Active
	}
	t := models.Taxonomy{
		ID:       id,
		Name:     strings.TrimSpace(f.Name),
		Keywords: pq.StringArray(f.Keywords),
		Active:   active,
	}
	if err := h.store.UpdateTaxonomy(t); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Delete DELETE /api/taxonomy/{id}
func (h *TaxonomyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteTaxonomy(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Approve POST /api/taxonomy/{id}/approve — promove pending → approved
func (h *TaxonomyHandler) Approve(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.SetTaxonomyStatus(id, "approved"); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Reject POST /api/taxonomy/{id}/reject — marca pending como rejeitada
func (h *TaxonomyHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.SetTaxonomyStatus(id, "rejected"); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
