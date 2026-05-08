package admin

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/lib/pq"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type AdsHandler struct {
	store store.Store
}

func NewAdsHandler(st store.Store) *AdsHandler {
	return &AdsHandler{store: st}
}

type adRequest struct {
	Name         string  `json:"name"`
	MessageText  string  `json:"message_text"`
	ImageURL     string  `json:"image_url"`
	ChannelIDs   []int64 `json:"channel_ids"`
	GroupIDs     []int64 `json:"group_ids"`
	ScheduleCron string  `json:"schedule_cron"`
	ActiveUntil  *string `json:"active_until"` // RFC3339
	Enabled      *bool   `json:"enabled"`
}

func (req adRequest) toModel() models.Ad {
	a := models.Ad{
		Name:         req.Name,
		MessageText:  req.MessageText,
		ChannelIDs:   pq.Int64Array(req.ChannelIDs),
		GroupIDs:     pq.Int64Array(req.GroupIDs),
		ScheduleCron: req.ScheduleCron,
		Enabled:      true,
	}
	if req.ImageURL != "" {
		a.ImageURL = models.NullString{NullString: sql.NullString{String: req.ImageURL, Valid: true}}
	}
	if req.ActiveUntil != nil && *req.ActiveUntil != "" {
		if t, err := time.Parse(time.RFC3339, *req.ActiveUntil); err == nil {
			a.ActiveUntil = models.NullTime{NullTime: sql.NullTime{Time: t, Valid: true}}
		}
	}
	if req.Enabled != nil {
		a.Enabled = *req.Enabled
	}
	return a
}

// List GET /api/ads?active=1
func (h *AdsHandler) List(w http.ResponseWriter, r *http.Request) {
	activeOnly := r.URL.Query().Get("active") == "1"
	out, err := h.store.ListAds(activeOnly)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if out == nil {
		out = []models.Ad{}
	}
	writeJSON(w, http.StatusOK, out)
}

// Get GET /api/ads/{id}
func (h *AdsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	a, err := h.store.GetAd(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "anúncio não encontrado")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// Create POST /api/ads
func (h *AdsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req adRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" || req.MessageText == "" {
		writeErr(w, http.StatusBadRequest, "name e message_text obrigatórios")
		return
	}
	a := req.toModel()
	id, err := h.store.CreateAd(a)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	a.ID = id
	writeJSON(w, http.StatusCreated, a)
}

// Update PATCH /api/ads/{id}
func (h *AdsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	existing, err := h.store.GetAd(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "não encontrado")
		return
	}
	var req adRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.MessageText != "" {
		existing.MessageText = req.MessageText
	}
	if req.ImageURL != "" {
		existing.ImageURL = models.NullString{NullString: sql.NullString{String: req.ImageURL, Valid: true}}
	}
	if req.ChannelIDs != nil {
		existing.ChannelIDs = pq.Int64Array(req.ChannelIDs)
	}
	if req.GroupIDs != nil {
		existing.GroupIDs = pq.Int64Array(req.GroupIDs)
	}
	if req.ScheduleCron != "" {
		existing.ScheduleCron = req.ScheduleCron
	}
	if req.ActiveUntil != nil {
		if *req.ActiveUntil == "" {
			existing.ActiveUntil = models.NullTime{}
		} else if t, err := time.Parse(time.RFC3339, *req.ActiveUntil); err == nil {
			existing.ActiveUntil = models.NullTime{NullTime: sql.NullTime{Time: t, Valid: true}}
		}
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	if err := h.store.UpdateAd(existing); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

// Delete DELETE /api/ads/{id}
func (h *AdsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteAd(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
