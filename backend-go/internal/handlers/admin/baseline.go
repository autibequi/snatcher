// Package admin — handlers de baseline para observabilidade pré-refactor.
package admin

import (
	"net/http"
	"strconv"

	"github.com/jmoiron/sqlx"
	"snatcher/backendv2/internal/repositories"
)

// CaptureBaselineHandler implementa POST /api/admin/baseline/capture.
// Captura um snapshot de todas as métricas de baselining e persiste em
// baseline_snapshots. Retorna 201 com snapshot_id, captured_at e mapa de métricas.
func CaptureBaselineHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Scope   string   `json:"scope"`
			Metrics []string `json:"metrics"`
		}
		// Body é opcional; ignorar erros de decode (body pode ser vazio).
		_ = decodeBody(r, &req)
		if req.Scope == "" {
			req.Scope = "global"
		}

		snapshotID, capturedAt, metrics, err := repositories.CaptureSnapshot(r.Context(), db, req.Scope)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao capturar snapshot: "+err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"snapshot_id": snapshotID,
			"captured_at": capturedAt,
			"scope":       req.Scope,
			"metrics":     metrics,
		})
	}
}

// ListBaselineHandler implementa GET /api/admin/baseline?limit=N.
// Lista os últimos N snapshots disponíveis (sem as métricas individuais).
func ListBaselineHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 50
		if v, err := parseIntQuery(r, "limit", 50); err == nil && v > 0 && v <= 200 {
			limit = v
		}

		snapshots, err := repositories.ListSnapshots(r.Context(), db, limit)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao listar snapshots")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if len(snapshots) == 0 {
			w.Write([]byte("[]")) //nolint:errcheck
			return
		}
		// writeJSON já define Content-Type e status.
		writeJSON(w, http.StatusOK, snapshots)
	}
}

// CompareBaselineHandler implementa GET /api/admin/baseline/compare?from=X&to=Y.
// Retorna diff entre dois snapshots identificados por seus IDs de referência.
func CompareBaselineHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fromStr := r.URL.Query().Get("from")
		toStr := r.URL.Query().Get("to")

		if fromStr == "" || toStr == "" {
			writeErr(w, http.StatusBadRequest, "parâmetros 'from' e 'to' são obrigatórios")
			return
		}

		fromID, err := strconv.ParseInt(fromStr, 10, 64)
		if err != nil || fromID <= 0 {
			writeErr(w, http.StatusBadRequest, "'from' deve ser um inteiro positivo")
			return
		}
		toID, err := strconv.ParseInt(toStr, 10, 64)
		if err != nil || toID <= 0 {
			writeErr(w, http.StatusBadRequest, "'to' deve ser um inteiro positivo")
			return
		}

		fromRows, err := repositories.GetSnapshot(r.Context(), db, fromID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "snapshot 'from' não encontrado")
			return
		}
		toRows, err := repositories.GetSnapshot(r.Context(), db, toID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "snapshot 'to' não encontrado")
			return
		}

		diff, err := repositories.CompareSnapshots(r.Context(), db, fromID, toID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao comparar snapshots")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"from": snapshotSummary(fromRows),
			"to":   snapshotSummary(toRows),
			"diff": diff,
		})
	}
}

// snapshotSummary converte []SnapshotRow em um envelope com id, captured_at e metrics map.
func snapshotSummary(rows []repositories.SnapshotRow) map[string]interface{} {
	if len(rows) == 0 {
		return map[string]interface{}{}
	}
	metrics := make(map[string]interface{}, len(rows))
	for _, row := range rows {
		if row.ValueNumeric != nil {
			metrics[row.MetricName] = *row.ValueNumeric
		} else if row.ValueJSON != nil {
			metrics[row.MetricName] = *row.ValueJSON
		} else {
			metrics[row.MetricName] = nil
		}
	}
	return map[string]interface{}{
		"id":          rows[0].ID,
		"captured_at": rows[0].CapturedAt,
		"scope":       rows[0].Scope,
		"metrics":     metrics,
	}
}
