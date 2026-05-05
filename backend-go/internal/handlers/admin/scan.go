package admin

import (
	"net/http"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/store"
)

type ScanHandler struct {
	store  store.Store
	runner *pipeline.Runner
	sched  *scheduler.Scheduler
}

func NewScan(st store.Store, runner *pipeline.Runner, sched *scheduler.Scheduler) *ScanHandler {
	return &ScanHandler{store: st, runner: runner, sched: sched}
}

func (h *ScanHandler) Status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.sched.Status())
}

func (h *ScanHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	logs, err := h.store.ListCrawlLogs(0, 50)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

func (h *ScanHandler) TriggerPipeline(w http.ResponseWriter, r *http.Request) {
	go h.runner.Run(r.Context())
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "triggered"})
}

func (h *ScanHandler) TriggerProcess(w http.ResponseWriter, r *http.Request) {
	go func() {
		_ = pipeline.ProcessCrawlResults(r.Context(), h.store)
	}()
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "triggered"})
}
