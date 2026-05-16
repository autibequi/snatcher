package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"

	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/models"
	store "snatcher/backendv2/internal/repositories"
)

type TaxonomyHandler struct {
	store store.Store
	llmFn func() llm.Client
}

func NewTaxonomyHandler(st store.Store) *TaxonomyHandler {
	return &TaxonomyHandler{store: st}
}

func (h *TaxonomyHandler) SetLLMFn(fn func() llm.Client) { h.llmFn = fn }

// List retorna entradas da taxonomia (categorias e/ou marcas) aprovadas.
// GET /api/taxonomy?type=category|brand&parent_id=X (type, parent_id opcionais)
func (h *TaxonomyHandler) List(w http.ResponseWriter, r *http.Request) {
	taxType := r.URL.Query().Get("type")
	if taxType != "" && taxType != "category" && taxType != "brand" {
		writeErr(w, http.StatusBadRequest, "type must be 'category' or 'brand'")
		return
	}

	parentIDStr := r.URL.Query().Get("parent_id")
	var parentID *int64
	if parentIDStr != "" {
		if pid, err := strconv.ParseInt(parentIDStr, 10, 64); err == nil {
			parentID = &pid
		}
	}

	out, err := h.store.ListTaxonomyWithParent(taxType, parentID)
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

// Suggest POST /api/taxonomy/suggest
// Body: { title: string, brand?: string }
// Retorna: { category, brand, tags[], confidence }
func (h *TaxonomyHandler) Suggest(w http.ResponseWriter, r *http.Request) {
	if h.llmFn == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}

	var req struct {
		Title string `json:"title"`
		Brand string `json:"brand"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if strings.TrimSpace(req.Title) == "" {
		writeErr(w, http.StatusBadRequest, "title obrigatório")
		return
	}

	cats, _ := h.store.ListTaxonomy("category")
	brands, _ := h.store.ListTaxonomy("brand")
	var catNames, brandNames []string
	for _, c := range cats {
		catNames = append(catNames, c.Name)
	}
	for _, b := range brands {
		brandNames = append(brandNames, b.Name)
	}
	if len(catNames) > 50 {
		catNames = catNames[:50]
	}
	if len(brandNames) > 50 {
		brandNames = brandNames[:50]
	}

	prompt := fmt.Sprintf(`Classifique este produto de e-commerce brasileiro.

Título: "%s"
Marca informada: "%s"

Categorias existentes (use uma quando aplicável): %s
Marcas existentes (use uma quando aplicável): %s

Responda EXCLUSIVAMENTE em JSON:
{
  "category": "slug-da-categoria",
  "brand": "Nome Da Marca",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "confidence": 0.85
}

Regras:
- category: prefira slugs já existentes; se não houver match, sugira um novo slug em snake_case
- brand: use a marca existente se reconhecer; senão, extraia do título; null se incerto
- tags: 3-7 tags relevantes em pt-BR (categoria mais específica, atributo do produto)
- confidence: 0.0 a 1.0`, req.Title, req.Brand, strings.Join(catNames, ", "), strings.Join(brandNames, ", "))

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resp, err := cli.Complete(ctx, prompt, llm.Options{
		MaxTokens:   1200,
		Temperature: 0.2,
		Operation:   "suggest_taxonomy",
		JSONMode:    true,
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "LLM: "+err.Error())
		return
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		writeErr(w, http.StatusBadGateway, "LLM resposta inválida")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
