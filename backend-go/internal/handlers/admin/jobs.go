package admin

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"snatcher/backendv2/internal/jobs"
)

type JobsHandler struct{}

func NewJobsHandler() *JobsHandler { return &JobsHandler{} }

// List GET /api/jobs
func (h *JobsHandler) List(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, jobs.Default().List())
}

// Cancel POST /api/jobs/{id}/cancel
func (h *JobsHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if jobs.Default().Cancel(id) {
		writeJSON(w, http.StatusOK, map[string]any{"cancelled": true})
		return
	}
	writeErr(w, http.StatusNotFound, "job não encontrado ou já finalizado")
}

// Clear POST /api/jobs/clear — remove jobs concluídos
func (h *JobsHandler) Clear(w http.ResponseWriter, r *http.Request) {
	n := jobs.Default().Clear()
	writeJSON(w, http.StatusOK, map[string]any{"cleared": n})
}

// CancelAll POST /api/jobs/cancel-all
func (h *JobsHandler) CancelAll(w http.ResponseWriter, r *http.Request) {
	n := jobs.Default().CancelAll()
	writeJSON(w, http.StatusOK, map[string]any{"cancelled": n})
}
