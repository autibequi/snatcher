package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// DispatchHandler handles POST/GET /api/dispatches.
type DispatchHandler struct {
	store store.Store
}

// NewDispatchHandler cria um DispatchHandler.
func NewDispatchHandler(st store.Store) *DispatchHandler {
	return &DispatchHandler{store: st}
}

type dispatchTargetReq struct {
	GroupID   *int64 `json:"group_id"`
	ChannelID *int64 `json:"channel_id"`
}

type createDispatchReq struct {
	ProductID     *int64              `json:"product_id"`
	Message       map[string]any      `json:"message"`
	AffiliateLink string              `json:"affiliate_link"`
	Targets       []dispatchTargetReq `json:"targets"`
	ScheduledFor  *string             `json:"scheduled_for"`
}

// Create handles POST /api/dispatches.
func (h *DispatchHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createDispatchReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	isDraft := len(req.Targets) == 0

	msgBytes, _ := json.Marshal(req.Message)
	if msgBytes == nil {
		msgBytes = []byte("{}")
	}

	d := models.Dispatch{
		ComposedBy:    "manual",
		Message:       msgBytes,
		AffiliateLink: req.AffiliateLink,
	}
	if req.ProductID != nil {
		d.ProductID = models.NullInt64{NullInt64: sql.NullInt64{Int64: *req.ProductID, Valid: true}}
	}
	if req.ScheduledFor != nil && *req.ScheduledFor != "" {
		formats := []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02T15:04:05"}
		for _, f := range formats {
			if t, err := time.ParseInLocation(f, *req.ScheduledFor, time.Local); err == nil {
				d.ScheduledFor = models.NullTime{NullTime: sql.NullTime{Time: t, Valid: true}}
				break
			}
		}
	}

	// Resolve targets: GroupID direto OU expandir ChannelID -> grupos ativos.
	var targets []models.DispatchTarget
	for _, t := range req.Targets {
		if t.GroupID != nil {
			targets = append(targets, models.DispatchTarget{GroupID: *t.GroupID})
		} else if t.ChannelID != nil {
			groups, err := h.store.ListRedesignGroups(*t.ChannelID, "", "active")
			if err == nil {
				for _, g := range groups {
					targets = append(targets, models.DispatchTarget{GroupID: g.ID})
				}
			}
		}
	}
	// Se não há targets → salvar como rascunho (sem envio)
	if isDraft || len(targets) == 0 {
		d.Status = "draft"
		id, err := h.store.CreateDispatch(d, nil)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao salvar rascunho")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"id":     id,
			"status": "draft",
		})
		return
	}

	id, err := h.store.CreateDispatch(d, targets)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar dispatch")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":            id,
		"targets_count": len(targets),
		"status":        "queued",
	})
}

// List handles GET /api/dispatches.
func (h *DispatchHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	dispatches, err := h.store.ListDispatches(status, 50, offset)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar dispatches")
		return
	}
	if dispatches == nil {
		dispatches = []models.Dispatch{}
	}
	writeJSON(w, http.StatusOK, dispatches)
}

// Get handles GET /api/dispatches/:id.
func (h *DispatchHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	d, err := h.store.GetDispatch(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "dispatch nao encontrado")
		return
	}
	targets, _ := h.store.ListDispatchTargets(id)
	if targets == nil {
		targets = []models.DispatchTarget{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"dispatch": d,
		"targets":  targets,
	})
}

// Cancel handles POST /api/dispatches/:id/cancel.
// Marca dispatch draft/queued como failed. Retorna 409 se já está sending/completed.
func (h *DispatchHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	d, err := h.store.GetDispatch(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "dispatch nao encontrado")
		return
	}
	if d.Status == "sending" || d.Status == "completed" {
		writeErr(w, http.StatusConflict, "dispatch ja esta em andamento ou concluido")
		return
	}

	if err := h.store.CancelDispatch(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao cancelar dispatch")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
}
