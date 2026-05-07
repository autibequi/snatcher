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
// Retorna produtos que precisam de curadoria: pending OU incompletos (sem marca ou sem categoria).
func (h *CurationHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	var rows []curationRow
	err := h.db.SelectContext(r.Context(), &rows, `
		SELECT id, canonical_name, brand, image_url, lowest_price, tags, curation_status,
		       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS created_at
		FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND (
		    curation_status = 'pending'
		    OR (brand IS NULL OR brand = '')
		    OR tags IS NULL
		    OR tags = '[]'::jsonb
		    OR jsonb_array_length(tags) = 0
		  )
		ORDER BY
		    CASE WHEN curation_status = 'pending' THEN 0 ELSE 1 END,
		    created_at DESC
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
	// Adiciona contagem de incompletos (sem marca ou sem categoria, não rejeitados)
	var incomplete int64
	_ = h.db.GetContext(r.Context(), &incomplete, `
		SELECT COUNT(*) FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND curation_status != 'pending'
		  AND ((brand IS NULL OR brand = '') OR tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0)`)
	rows = append(rows, stat{Status: "incomplete", Count: incomplete})
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
// Roda heurísticas em produtos pending e incompletos (sem marca ou sem categoria).
func (h *CurationHandler) AutoHeuristic(w http.ResponseWriter, r *http.Request) {
	var products []curationRow
	err := h.db.SelectContext(r.Context(), &products, `
		SELECT id, canonical_name, brand, tags, curation_status
		FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND (
		    curation_status = 'pending'
		    OR (brand IS NULL OR brand = '')
		    OR tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0
		  )
		LIMIT 200`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	processed, categorized, branded := 0, 0, 0
	for _, row := range products {
		p, err := h.store.GetCatalogProduct(row.ID)
		if err != nil {
			continue
		}
		changed := false
		// Extrai quantity se ainda vazio
		if p.Quantity == "" {
			if q := pipeline.ExtractQuantity(p.CanonicalName); q != "" {
				p.Quantity = q
				changed = true
			}
		}
		// Detecta taxonomia — preenche categoria e marca
		matchedIDs, _ := h.store.DetectAndUpsertTaxonomy(p.CanonicalName)
		if len(matchedIDs) > 0 {
			taxEntries, _ := h.store.GetTaxonomyByIDs(matchedIDs)
			for _, t := range taxEntries {
				switch t.Type {
				case "brand":
					if !p.Brand.Valid || p.Brand.String == "" {
						p.Brand.String = t.Name
						p.Brand.Valid = true
						branded++
						changed = true
					}
				case "category":
					tags := p.GetTags()
					found := false
					for _, tag := range tags {
						if strings.EqualFold(tag, t.Name) {
							found = true
							break
						}
					}
					if !found {
						p.SetTags(append(tags, t.Name))
						changed = true
					}
				}
			}
			if p.CurationStatus == "pending" {
				p.CurationStatus = "auto"
				categorized++
				changed = true
			}
		}
		if changed {
			_ = h.store.UpdateCatalogProduct(p)
		}
		processed++
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"processed":   processed,
		"categorized": categorized,
		"branded":     branded,
		"remaining":   len(products) - categorized,
	})
}

// AutoLLM POST /api/curation/auto-llm
// Envia produtos incompletos ao LLM para inferir atributos e propor novas taxonomias.
func (h *CurationHandler) AutoLLM(w http.ResponseWriter, r *http.Request) {
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado — configure em Configurações → LLM/IA")
		return
	}

	var products []curationRow
	err := h.db.SelectContext(r.Context(), &products, `
		SELECT id, canonical_name, brand, tags, curation_status
		FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND (
		    curation_status = 'pending'
		    OR (brand IS NULL OR brand = '')
		    OR tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0
		  )
		ORDER BY created_at DESC LIMIT 20`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(products) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"processed": 0, "message": "nada pendente ou incompleto"})
		return
	}

	processed, categorized, newTaxonomies := 0, 0, 0
	for _, row := range products {
		prompt := fmt.Sprintf(`Você é um especialista em e-commerce brasileiro de suplementos e produtos fitness.
Dado o nome de produto abaixo, responda SOMENTE um JSON com os campos:
{
  "category": "categoria principal em português (ex: Suplementos, Smartphones, Tênis) ou null",
  "brand": "marca do produto (ex: Growth, Black Skull, Vitafor) ou null",
  "quantity": "tamanho/quantidade (ex: 900g, 2kg, 30 caps) ou null",
  "flavor": "sabor se aplicável (ex: Chocolate, Baunilha, Morango) ou null",
  "new_taxonomies": [
    {"type": "brand|category|flavor|weight", "name": "Nome da entrada", "keywords": ["kw1", "kw2"]}
  ]
}

Inclua em new_taxonomies quaisquer marcas, categorias, sabores ou tamanhos novos que você identificar e que possam ser úteis para classificar outros produtos similares.

Nome: %s

Responda apenas o JSON, sem markdown nem texto extra.`, row.CanonicalName)

		resp, err := cli.Complete(r.Context(), prompt, llm.Options{
			MaxTokens:   300,
			Temperature: 0.1,
			Operation:   "curation",
		})
		if err != nil {
			continue
		}

		resp = strings.TrimSpace(resp)
		resp = strings.TrimPrefix(resp, "```json")
		resp = strings.TrimPrefix(resp, "```")
		resp = strings.TrimSuffix(resp, "```")
		resp = strings.TrimSpace(resp)

		var result struct {
			Category     *string `json:"category"`
			Brand        *string `json:"brand"`
			Quantity     *string `json:"quantity"`
			Flavor       *string `json:"flavor"`
			NewTaxonomies []struct {
				Type     string   `json:"type"`
				Name     string   `json:"name"`
				Keywords []string `json:"keywords"`
			} `json:"new_taxonomies"`
		}
		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			continue
		}

		p, err := h.store.GetCatalogProduct(row.ID)
		if err != nil {
			continue
		}

		changed := false
		if result.Category != nil && *result.Category != "" {
			tags := p.GetTags()
			tags = append(tags, *result.Category)
			p.SetTags(tags)
			if p.CurationStatus == "pending" {
				p.CurationStatus = "curated"
				categorized++
			}
			changed = true
		}
		if result.Brand != nil && *result.Brand != "" && (!p.Brand.Valid || p.Brand.String == "") {
			p.Brand.String = *result.Brand
			p.Brand.Valid = true
			changed = true
		}
		if result.Quantity != nil && *result.Quantity != "" && p.Quantity == "" {
			p.Quantity = *result.Quantity
			changed = true
		}
		if result.Flavor != nil && *result.Flavor != "" {
			tags := p.GetTags()
			tags = append(tags, *result.Flavor)
			p.SetTags(tags)
			changed = true
		}
		if changed {
			_ = h.store.UpdateCatalogProduct(p)
		}
		processed++

		// Salvar propostas de novas taxonomias como pending para revisão humana
		for _, nt := range result.NewTaxonomies {
			if nt.Type == "" || nt.Name == "" {
				continue
			}
			validTypes := map[string]bool{"brand": true, "category": true, "flavor": true, "weight": true, "color": true, "size": true, "quantity": true}
			if !validTypes[nt.Type] {
				continue
			}
			if len(nt.Keywords) == 0 {
				nt.Keywords = []string{strings.ToLower(nt.Name)}
			}
			_, _ = h.store.SuggestTaxonomyCandidate(nt.Type, nt.Name, nt.Keywords, row.CanonicalName, "llm")
			newTaxonomies++
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"processed":      processed,
		"categorized":    categorized,
		"new_taxonomies": newTaxonomies,
		"remaining":      len(products) - categorized,
	})
}
