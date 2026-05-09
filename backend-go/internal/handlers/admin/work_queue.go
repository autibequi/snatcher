package admin

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sort"
	"time"

	"snatcher/backendv2/internal/jobs"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// WorkQueueHandler expõe GET /api/work-queue — visão unificada FIFO de jobs (persistidos em background_jobs quando configurado) + auditoria Jonfrey.
type WorkQueueHandler struct {
	Store store.Store
}

func NewWorkQueueHandler(st store.Store) *WorkQueueHandler {
	return &WorkQueueHandler{Store: st}
}

const (
	jobStaleMaxAge      = 21 * time.Minute // alinha com reclamação “running >21min”
	jonfreyStaleMinutes = 20
)

type unifiedRow struct {
	TS   time.Time
	Item map[string]any
}

// Get GET /api/work-queue
func (h *WorkQueueHandler) Get(w http.ResponseWriter, r *http.Request) {
	jFixed := jobs.Default().ReconcileStaleRunning(jobStaleMaxAge)

	msg := "encerrado como falha: execução não finalizou a tempo ou o servidor reiniciou (running antigo)."
	jfFixed := int64(0)
	if h.Store != nil {
		if n, err := h.Store.ReconcileStaleJonfreyActions(jonfreyStaleMinutes, msg); err != nil {
			slog.Warn("work-queue reconcile jonfrey", "err", err)
		} else {
			jfFixed = n
		}
	}

	var rows []unifiedRow

	for _, j := range jobs.Default().ListFIFO() {
		act := make([]map[string]any, 0, len(j.Activity))
		for _, a := range j.Activity {
			act = append(act, map[string]any{"at": a.At.Format(time.RFC3339Nano), "message": a.Message})
		}
		item := map[string]any{
			"kind":       "job",
			"queue_ts":   j.StartedAt.Format(time.RFC3339Nano),
			"id":         j.ID,
			"job_kind":   j.Kind,
			"name":       j.Name,
			"status":     string(j.Status),
			"started_at": j.StartedAt.Format(time.RFC3339Nano),
			"progress":   j.Progress,
			"total":      j.Total,
			"done":       j.Done,
			"message":    j.Message,
			"error":      j.Error,
			"activity":   act,
		}
		if j.CompletedAt != nil {
			item["completed_at"] = j.CompletedAt.Format(time.RFC3339Nano)
		}
		rows = append(rows, unifiedRow{TS: j.StartedAt, Item: item})
	}

	if h.Store != nil {
		ja, err := h.Store.ListJonfreyActionsForWorkQueue(180)
		if err != nil {
			slog.Warn("work-queue ListJonfreyActionsForWorkQueue", "err", err)
		} else {
			for _, a := range ja {
				item := jonfreyActionToQueueItem(a)
				rows = append(rows, unifiedRow{TS: a.CreatedAt, Item: item})
			}
		}
	}

	sort.SliceStable(rows, func(i, j int) bool {
		return rows[i].TS.Before(rows[j].TS)
	})

	out := make([]map[string]any, len(rows))
	for i := range rows {
		out[i] = rows[i].Item
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items": out,
		"stats": map[string]any{
			"job_stale_reconciled":    jFixed,
			"jonfrey_stale_reconciled": jfFixed,
			"generated_at":            time.Now().UTC().Format(time.RFC3339Nano),
		},
	})
}

// Clear POST /api/work-queue/clear
// Remove jobs terminal em background_jobs (completed/failed/cancelled) + auditoria Jonfrey já finalizada.
func (h *WorkQueueHandler) Clear(w http.ResponseWriter, r *http.Request) {
	nJobs := jobs.Default().Clear()
	var nJF int64
	if h.Store != nil {
		n, err := h.Store.DeleteTerminalJonfreyActions()
		if err != nil {
			slog.Warn("work-queue DeleteTerminalJonfreyActions", "err", err)
		} else {
			nJF = n
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"cleared_jobs":    nJobs,
		"cleared_jonfrey": nJF,
	})
}

func jonfreyActionToQueueItem(a models.JonfreyAction) map[string]any {
	var before, after map[string]any
	if len(a.BeforeSnapshot) > 0 {
		_ = json.Unmarshal(a.BeforeSnapshot, &before)
	}
	if len(a.AfterSnapshot) > 0 {
		_ = json.Unmarshal(a.AfterSnapshot, &after)
	}
	if before == nil {
		before = map[string]any{}
	}
	if after == nil {
		after = map[string]any{}
	}
	item := map[string]any{
		"kind":          "jonfrey_audit",
		"queue_ts":      a.CreatedAt.Format(time.RFC3339Nano),
		"id":            a.ID,
		"action_type":   a.ActionType,
		"status":        a.Status,
		"triggered_by":  a.TriggeredBy,
		"created_at":    a.CreatedAt.Format(time.RFC3339Nano),
		"reasoning":     nullStr(a.Reasoning),
		"error_message": nullStr(a.ErrorMessage),
		"before":        before,
		"after":         after,
	}
	if a.Target.Valid {
		item["target"] = a.Target.String
	}
	if a.FinishedAt.Valid {
		item["finished_at"] = a.FinishedAt.Time.Format(time.RFC3339Nano)
	}
	return item
}

func nullStr(ns models.NullString) any {
	if !ns.Valid {
		return nil
	}
	return ns.String
}
