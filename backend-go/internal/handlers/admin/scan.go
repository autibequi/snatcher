package admin

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"snatcher/backendv2/internal/jobs"
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
	job, ctx := jobs.Default().Start(context.Background(), "Pipeline[full-scan]")
	jobID := job.ID
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				jobs.Default().Fail(jobID, fmt.Sprintf("panic: %v", rec))
			}
		}()
		jobs.Default().Update(jobID, 0, 1, "executando full pipeline…")
		if err := h.runner.Run(ctx); err != nil {
			// Runner já executa as 3 etapas (crawl→process→evaluate) em modo best-effort;
			// err é o primeiro erro agregado — útil pra diagnóstico, não indica que nada rodou.
			slog.Warn("pipeline job: rodada com alerta", "job_id", jobID, "err", err)
			jobs.Default().Done(jobID, fmt.Sprintf("pipeline finalizado (etapas executadas) — alerta: %v", err))
			return
		}
		jobs.Default().Done(jobID, "pipeline concluído")
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "triggered", "job_id": jobID})
}

func (h *ScanHandler) TriggerProcess(w http.ResponseWriter, r *http.Request) {
	job, ctx := jobs.Default().Start(context.Background(), "ProcessCrawlResults")
	jobID := job.ID
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				jobs.Default().Fail(jobID, fmt.Sprintf("panic: %v", rec))
			}
		}()
		jobs.Default().Update(jobID, 0, 1, "processando crawl results…")
		if err := pipeline.ProcessCrawlResults(ctx, h.store); err != nil {
			jobs.Default().Fail(jobID, err.Error())
			return
		}
		jobs.Default().Done(jobID, "processamento concluído")
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "triggered", "job_id": jobID})
}
