package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"snatcher/backendv2/internal/store"
)

type MatchLogHandler struct {
	store store.Store
}

func NewMatchLog(st store.Store) *MatchLogHandler {
	return &MatchLogHandler{store: st}
}

// ListProductTaxonomies GET /api/match-logs/products/:product_id/taxonomies
func (h *MatchLogHandler) ListProductTaxonomies(w http.ResponseWriter, r *http.Request) {
	productIDStr := r.PathValue("product_id")
	productID, err := strconv.ParseInt(productIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid product_id", http.StatusBadRequest)
		return
	}

	taxonomies, err := h.store.ListProductTaxonomies(productID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(taxonomies)
}

// UpsertProductTaxonomy POST /api/match-logs/products/:product_id/taxonomies
func (h *MatchLogHandler) UpsertProductTaxonomy(w http.ResponseWriter, r *http.Request) {
	productIDStr := r.PathValue("product_id")
	productID, err := strconv.ParseInt(productIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid product_id", http.StatusBadRequest)
		return
	}

	var payload struct {
		TaxonomyID int64   `json:"taxonomy_id"`
		Role       string  `json:"role"`
		Confidence float64 `json:"confidence"`
		Source     string  `json:"source"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.store.UpsertProductTaxonomy(productID, payload.TaxonomyID, payload.Role, payload.Confidence, payload.Source); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ListFalsePositiveLogs GET /api/match-logs/false-positives?since_days=7
func (h *MatchLogHandler) ListFalsePositiveLogs(w http.ResponseWriter, r *http.Request) {
	sinceDaysStr := r.URL.Query().Get("since_days")
	sinceDays := 7
	if sinceDaysStr != "" {
		if d, err := strconv.Atoi(sinceDaysStr); err == nil {
			sinceDays = d
		}
	}

	logs, err := h.store.ListFalsePositiveLogs(sinceDays)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}

// MarkFalsePositive POST /api/match-logs/:log_id/false-positive
func (h *MatchLogHandler) MarkFalsePositive(w http.ResponseWriter, r *http.Request) {
	logIDStr := r.PathValue("log_id")
	logID, err := strconv.ParseInt(logIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid log_id", http.StatusBadRequest)
		return
	}

	var payload struct {
		Reason string `json:"reason"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.store.MarkAutoMatchFalsePositive(logID, payload.Reason); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "marked"})
}

// UpdateScoreBreakdown POST /api/match-logs/:log_id/score-breakdown
func (h *MatchLogHandler) UpdateScoreBreakdown(w http.ResponseWriter, r *http.Request) {
	logIDStr := r.PathValue("log_id")
	logID, err := strconv.ParseInt(logIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid log_id", http.StatusBadRequest)
		return
	}

	var payload struct {
		Breakdown []byte   `json:"breakdown"`
		Reasons   []string `json:"reasons"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.store.UpdateAutoMatchScoreBreakdown(logID, payload.Breakdown, payload.Reasons); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

// UpdateProductAttributes PUT /api/match-logs/products/:product_id/attributes
func (h *MatchLogHandler) UpdateProductAttributes(w http.ResponseWriter, r *http.Request) {
	productIDStr := r.PathValue("product_id")
	productID, err := strconv.ParseInt(productIDStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid product_id", http.StatusBadRequest)
		return
	}

	var payload struct {
		Attributes json.RawMessage `json:"attributes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.store.UpdateProductAttributesJSON(productID, payload.Attributes); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

// GetVariantBySourceSubID GET /api/match-logs/variants/:source/:sub_id
func (h *MatchLogHandler) GetVariantBySourceSubID(w http.ResponseWriter, r *http.Request) {
	source := r.PathValue("source")
	subID := r.PathValue("sub_id")

	variant, found, err := h.store.GetVariantBySourceSubID(source, subID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if !found {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(variant)
}
