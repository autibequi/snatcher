package admin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
)

type CurationHandler struct {
	store  store.Store
	db     *sqlx.DB
	llmFn  func() llm.Client // factory lazy — lê config do banco
}

func NewCurationHandler(st store.Store, db *sqlx.DB, llmFn func() llm.Client) *CurationHandler {
	return &CurationHandler{store: st, db: db, llmFn: llmFn}
}

func (h *CurationHandler) SetLLMFn(fn func() llm.Client) {
	h.llmFn = fn
}

type curationRow struct {
	ID            int64   `db:"id" json:"id"`
	CanonicalName string  `db:"canonical_name" json:"canonical_name"`
	Brand         *string `db:"brand" json:"brand,omitempty"`
	ImageURL      *string `db:"image_url" json:"image_url,omitempty"`
	LowestPrice   *float64 `db:"lowest_price" json:"lowest_price,omitempty"`
	Tags          string  `db:"tags" json:"tags"`
	CurationStatus string `db:"curation_status" json:"curation_status"`
	CreatedAt     string  `db:"created_at" json:"created_at"`
}

// List GET /api/curation/needs-taxonomy
// Retorna produtos que o pipeline não conseguiu inferir categoria/marca via taxonomy.
func (h *CurationHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	var rows []curationRow
	err := h.db.SelectContext(r.Context(), &rows, `
		SELECT id, canonical_name, brand, image_url, lowest_price, tags, curation_status,
		       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS created_at
		FROM catalogproduct
		WHERE curation_status = 'pending'
		ORDER BY created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []curationRow{}
	}
	writeJSON(w, http.StatusOK, rows)
}

// Stats GET /api/curation/stats
func (h *CurationHandler) Stats(w http.ResponseWriter, r *http.Request) {
	type stat struct {
		Status string `db:"curation_status" json:"status"`
		Count  int64  `db:"count" json:"count"`
	}
	var rows []stat
	_ = h.db.SelectContext(r.Context(), &rows, `
		SELECT curation_status, COUNT(*) AS count
		FROM catalogproduct
		GROUP BY curation_status
		ORDER BY count DESC`)
	if rows == nil {
		rows = []stat{}
	}
	writeJSON(w, http.StatusOK, rows)
}

type assignTaxonomyForm struct {
	Categories []string `json:"categories"`
	Brand      string   `json:"brand"`
}

// AssignTaxonomy PATCH /api/curation/{id}/taxonomy
// Aplica categoria(s)+marca ao produto e marca como curated.
func (h *CurationHandler) AssignTaxonomy(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var f assignTaxonomyForm
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	// Mescla categorias atuais + novas (sem duplicar)
	current := p.GetTags()
	seen := map[string]bool{}
	for _, t := range current {
		seen[strings.ToLower(t)] = true
	}
	for _, c := range f.Categories {
		c = strings.TrimSpace(c)
		if c == "" || seen[strings.ToLower(c)] {
			continue
		}
		current = append(current, c)
		seen[strings.ToLower(c)] = true
	}
	p.SetTags(current)
	if strings.TrimSpace(f.Brand) != "" {
		p.Brand.String = strings.TrimSpace(f.Brand)
		p.Brand.Valid = true
	}
	p.CurationStatus = "curated"
	if err := h.store.UpdateCatalogProduct(p); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Reject POST /api/curation/{id}/reject — descarta produto da fila
func (h *CurationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	p.CurationStatus = "rejected"
	if err := h.store.UpdateCatalogProduct(p); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// AutoHeuristic POST /api/curation/auto-heuristic
// Roda heurísticas (BeautifyTitle + DetectAndUpsertTaxonomy) em todos os produtos pending.
func (h *CurationHandler) AutoHeuristic(w http.ResponseWriter, r *http.Request) {
	var products []curationRow
	err := h.db.SelectContext(r.Context(), &products, `
		SELECT id, canonical_name, brand, tags, curation_status
		FROM catalogproduct WHERE curation_status = 'pending' LIMIT 200`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	processed, categorized := 0, 0
	for _, row := range products {
		p, err := h.store.GetCatalogProduct(row.ID)
		if err != nil {
			continue
		}
		// Extrai quantity se ainda vazio
		if p.Quantity == "" {
			p.Quantity = pipeline.ExtractQuantity(p.CanonicalName)
		}
		// Detecta taxonomia
		matchedIDs, _ := h.store.DetectAndUpsertTaxonomy(p.CanonicalName)
		if len(matchedIDs) > 0 {
			p.CurationStatus = "auto"
			categorized++
		}
		_ = h.store.UpdateCatalogProduct(p)
		processed++
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"processed":   processed,
		"categorized": categorized,
		"remaining":   len(products) - categorized,
	})
}

// AutoLLM POST /api/curation/auto-llm
// Envia produtos pending ao LLM para inferir category, brand e quantity.
func (h *CurationHandler) AutoLLM(w http.ResponseWriter, r *http.Request) {
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado — configure em Configurações → LLM/IA")
		return
	}

	var products []curationRow
	err := h.db.SelectContext(r.Context(), &products, `
		SELECT id, canonical_name, brand, tags, curation_status
		FROM catalogproduct WHERE curation_status = 'pending'
		ORDER BY created_at DESC LIMIT 20`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(products) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"processed": 0, "message": "nada pendente"})
		return
	}

	processed, categorized := 0, 0
	for _, row := range products {
		prompt := fmt.Sprintf(`Você é um especialista em e-commerce brasileiro.
Dado o nome de produto abaixo, responda SOMENTE um JSON com os campos:
- category: categoria principal em português (ex: "Suplementos", "Smartphones", "Tênis")
- brand: marca do produto (ex: "Growth", "Samsung", "Nike") ou null se não identificado
- quantity: tamanho/quantidade/medida (ex: "900g", "128GB", "Par") ou null se não aplicável

Nome: %s

Responda apenas o JSON, sem markdown nem texto extra.`, row.CanonicalName)

		resp, err := cli.Complete(r.Context(), prompt, llm.Options{
			MaxTokens:   80,
			Temperature: 0.1,
			Operation:   "curation",
		})
		if err != nil {
			continue
		}

		// Parse do JSON da resposta
		resp = strings.TrimSpace(resp)
		// Remove markdown code fences se presentes
		resp = strings.TrimPrefix(resp, "```json")
		resp = strings.TrimPrefix(resp, "```")
		resp = strings.TrimSuffix(resp, "```")
		resp = strings.TrimSpace(resp)

		var result struct {
			Category string  `json:"category"`
			Brand    *string `json:"brand"`
			Quantity *string `json:"quantity"`
		}
		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			continue
		}

		p, err := h.store.GetCatalogProduct(row.ID)
		if err != nil {
			continue
		}

		if result.Category != "" {
			tags := p.GetTags()
			tags = append(tags, result.Category)
			p.SetTags(tags)
			p.CurationStatus = "curated"
			categorized++
		}
		if result.Brand != nil && *result.Brand != "" {
			p.Brand.String = *result.Brand
			p.Brand.Valid = true
		}
		if result.Quantity != nil && *result.Quantity != "" && p.Quantity == "" {
			p.Quantity = *result.Quantity
		}

		_ = h.store.UpdateCatalogProduct(p)
		processed++
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"processed":   processed,
		"categorized": categorized,
		"remaining":   len(products) - categorized,
	})
}
