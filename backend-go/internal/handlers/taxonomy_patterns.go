package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	store "snatcher/backendv2/internal/repositories"
)

type TaxonomyPatternHandler struct {
	store store.Store
}

func NewTaxonomyPattern(st store.Store) *TaxonomyPatternHandler {
	return &TaxonomyPatternHandler{store: st}
}

// ListTaxonomyPatterns GET /api/taxonomy/patterns?taxonomy_ids=1,2,3&kinds=word_boundary,regex
func (h *TaxonomyPatternHandler) ListTaxonomyPatterns(w http.ResponseWriter, r *http.Request) {
	taxonomyIDsStr := r.URL.Query().Get("taxonomy_ids")
	kindsStr := r.URL.Query().Get("kinds")

	var taxonomyIDs []int64
	var kinds []string

	if taxonomyIDsStr != "" {
		parts := strings.Split(taxonomyIDsStr, ",")
		for _, p := range parts {
			if p = strings.TrimSpace(p); p != "" {
				if id, err := strconv.ParseInt(p, 10, 64); err == nil {
					taxonomyIDs = append(taxonomyIDs, id)
				}
			}
		}
	}

	if kindsStr != "" {
		parts := strings.Split(kindsStr, ",")
		for _, p := range parts {
			if p = strings.TrimSpace(p); p != "" {
				kinds = append(kinds, p)
			}
		}
	}

	patterns, err := h.store.ListTaxonomyPatterns(taxonomyIDs, kinds)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(patterns)
}

// ListAllActivePatterns GET /api/taxonomy/patterns/active
func (h *TaxonomyPatternHandler) ListAllActivePatterns(w http.ResponseWriter, r *http.Request) {
	patterns, err := h.store.ListAllActivePatterns()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(patterns)
}

// MaxPatternUpdatedAt GET /api/taxonomy/patterns/max-updated-at
func (h *TaxonomyPatternHandler) MaxPatternUpdatedAt(w http.ResponseWriter, r *http.Request) {
	maxTime, err := h.store.MaxTaxonomyPatternUpdatedAt()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"max_updated_at": maxTime,
	})
}
