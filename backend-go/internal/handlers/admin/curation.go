package admin

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/store"
)

type CurationHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewCurationHandler(st store.Store, db *sqlx.DB) *CurationHandler {
	return &CurationHandler{store: st, db: db}
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
