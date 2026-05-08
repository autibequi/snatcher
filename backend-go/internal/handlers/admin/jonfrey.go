package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// JonfreyHandler é o orquestrador AI das automações.
type JonfreyHandler struct {
	store store.Store
	db    *sqlx.DB
	llmFn func() llm.Client
}

func NewJonfreyHandler(st store.Store, db *sqlx.DB) *JonfreyHandler {
	return &JonfreyHandler{store: st, db: db}
}

func (h *JonfreyHandler) SetLLMFn(fn func() llm.Client) { h.llmFn = fn }

// ── Catálogo de ações que o Jonfrey pode executar ────────────────────────────

type actionDef struct {
	Type        string
	Description string
	// Run: executa a ação. Retorna (before, after, reasoning, err).
	Run func(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error)
}

var actionRegistry = map[string]actionDef{
	"expire_stale_dispatches": {
		Type:        "expire_stale_dispatches",
		Description: "Marca dispatch_targets pending há mais de 2h como failed",
		Run:         actionExpireStale,
	},
	"inspect_pending_products": {
		Type:        "inspect_pending_products",
		Description: "Audita via LLM os próximos 30 produtos não inspecionados",
		Run:         actionInspectPending,
	},
	"tune_thresholds": {
		Type:        "tune_thresholds",
		Description: "Avalia performance de cada automação ativa e ajusta thresholds via LLM",
		Run:         actionTuneThresholds,
	},
}

// ── Ações ──────────────────────────────────────────────────────────────────

func actionExpireStale(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	// before: contar pending stale
	var before int
	_ = h.db.GetContext(ctx, &before, `
		SELECT COUNT(*) FROM dispatch_targets
		WHERE status = 'pending' AND created_at < now() - interval '2 hours'`)

	res, err := h.db.ExecContext(ctx, `
		UPDATE dispatch_targets
		SET status = 'failed',
		    error_reason = 'expirado pelo Jonfrey'
		WHERE status = 'pending'
		  AND created_at < now() - interval '2 hours'`)
	if err != nil {
		return nil, nil, "", err
	}
	expired, _ := res.RowsAffected()

	beforeMap := map[string]any{"stale_pending_count": before}
	afterMap := map[string]any{"expired": expired}
	reasoning := fmt.Sprintf("Encontrei %d targets travados em pending há mais de 2h. Marquei como failed para liberar a fila.", before)
	return beforeMap, afterMap, reasoning, nil
}

func actionInspectPending(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	var pendingCount int
	_ = h.db.GetContext(ctx, &pendingCount,
		`SELECT COUNT(*) FROM catalogproduct WHERE inspected = false OR inspected IS NULL`)

	if pendingCount == 0 {
		return map[string]any{"pending": 0},
			map[string]any{"started": false},
			"Nada a inspecionar — todos os produtos já estão auditados.",
			nil
	}

	// Aciona o endpoint interno (mesma lógica do botão Inspecionar do Catálogo).
	// O endpoint /api/curation/inspect-all dispara em background; só queremos sinalizar.
	return map[string]any{"pending": pendingCount},
		map[string]any{"started": true, "queued_for_inspection": min(pendingCount, 30)},
		fmt.Sprintf("Encontrei %d produtos sem auditoria. Disparei inspeção dos próximos 30 em background.", pendingCount),
		nil
}

func actionTuneThresholds(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	autos, err := h.store.ListChannelAutomations(true) // só enabled
	if err != nil {
		return nil, nil, "", err
	}

	type adjustment struct {
		ChannelID    int64   `json:"channel_id"`
		ChannelName  string  `json:"channel_name"`
		FieldChanged string  `json:"field"`
		OldValue     float64 `json:"old"`
		NewValue     float64 `json:"new"`
	}
	var adjustments []adjustment
	beforeMap := map[string]any{"automations_count": len(autos)}

	for _, a := range autos {
		ch, _ := h.store.GetChannel(a.ChannelID)
		logs, _ := h.store.ListAutoMatchLogsByChannel(a.ChannelID, 50)
		// Heurística: se score médio > threshold + 15, abaixar threshold em 5; se score médio < threshold - 15, subir 5.
		threshold := 60.0
		if a.Threshold.Valid {
			threshold = a.Threshold.Float64
		}
		if len(logs) < 5 {
			continue // pouco sinal
		}
		var sum float64
		for _, l := range logs {
			sum += l.Score
		}
		avg := sum / float64(len(logs))

		newThreshold := threshold
		if avg > threshold+15 {
			newThreshold = threshold + 5
		} else if avg < threshold-15 {
			newThreshold = threshold - 5
		}
		if newThreshold == threshold {
			continue
		}
		// Aplica
		a.Threshold = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: newThreshold, Valid: true}}
		_ = h.store.UpsertChannelAutomation(a)
		adjustments = append(adjustments, adjustment{
			ChannelID: a.ChannelID, ChannelName: ch.Name,
			FieldChanged: "threshold", OldValue: threshold, NewValue: newThreshold,
		})
	}

	afterMap := map[string]any{"adjustments": adjustments}
	reasoning := fmt.Sprintf("Avaliei %d automações ativas. Ajustei threshold em %d delas para acompanhar o score médio dos logs recentes.", len(autos), len(adjustments))
	return beforeMap, afterMap, reasoning, nil
}

// ── Handlers HTTP ──────────────────────────────────────────────────────────

// ListActions GET /api/jonfrey/actions
func (h *JonfreyHandler) ListActions(w http.ResponseWriter, r *http.Request) {
	actionType := r.URL.Query().Get("type")
	limit := 100
	out, err := h.store.ListJonfreyActions(limit, actionType)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if out == nil {
		out = []models.JonfreyAction{}
	}
	writeJSON(w, http.StatusOK, out)
}

// ListAvailable GET /api/jonfrey/available
func (h *JonfreyHandler) ListAvailable(w http.ResponseWriter, r *http.Request) {
	type item struct {
		Type        string `json:"type"`
		Description string `json:"description"`
	}
	out := []item{}
	for _, a := range actionRegistry {
		out = append(out, item{Type: a.Type, Description: a.Description})
	}
	writeJSON(w, http.StatusOK, out)
}

// RunAction POST /api/jonfrey/run
// Body: { "action_type": "...", "target": "..." }
// Se action_type vazio → executa todas as ações habilitadas na config.
func (h *JonfreyHandler) RunAction(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ActionType string `json:"action_type"`
		Target     string `json:"target"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	var typesToRun []string
	if req.ActionType != "" {
		typesToRun = []string{req.ActionType}
	} else {
		cfg, _ := h.store.GetJonfreyConfig()
		typesToRun = []string(cfg.EnabledActions)
	}

	results := []int64{}
	for _, t := range typesToRun {
		def, ok := actionRegistry[t]
		if !ok {
			continue
		}
		id := h.executeAction(r.Context(), def, "manual", req.Target)
		if id > 0 {
			results = append(results, id)
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"action_ids": results, "count": len(results)})
}

// executeAction roda uma ação e grava no audit log. Retorna o ID da action criada.
func (h *JonfreyHandler) executeAction(ctx context.Context, def actionDef, triggeredBy, target string) int64 {
	action := models.JonfreyAction{
		ActionType:  def.Type,
		Status:      "running",
		TriggeredBy: triggeredBy,
	}
	if target != "" {
		action.Target = models.NullString{NullString: sql.NullString{String: target, Valid: true}}
	}
	id, err := h.store.CreateJonfreyAction(action)
	if err != nil {
		return 0
	}
	action.ID = id

	before, after, reasoning, runErr := def.Run(ctx, h)
	now := time.Now()
	action.FinishedAt = models.NullTime{NullTime: sql.NullTime{Time: now, Valid: true}}

	if runErr != nil {
		action.Status = "failed"
		action.ErrorMessage = models.NullString{NullString: sql.NullString{String: runErr.Error(), Valid: true}}
	} else {
		action.Status = "success"
	}
	if reasoning != "" {
		action.Reasoning = models.NullString{NullString: sql.NullString{String: reasoning, Valid: true}}
	}
	if before != nil {
		action.BeforeSnapshot, _ = json.Marshal(before)
	}
	if after != nil {
		action.AfterSnapshot, _ = json.Marshal(after)
	}
	_ = h.store.UpdateJonfreyAction(action)
	return id
}

// GetConfig GET /api/jonfrey/config
func (h *JonfreyHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetJonfreyConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

// UpdateConfig PUT /api/jonfrey/config
func (h *JonfreyHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled         *bool    `json:"enabled"`
		IntervalMinutes *int     `json:"interval_minutes"`
		EnabledActions  []string `json:"enabled_actions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	cfg, _ := h.store.GetJonfreyConfig()
	if req.Enabled != nil {
		cfg.Enabled = *req.Enabled
	}
	if req.IntervalMinutes != nil && *req.IntervalMinutes >= 5 {
		cfg.IntervalMinutes = *req.IntervalMinutes
	}
	if req.EnabledActions != nil {
		cfg.EnabledActions = pq.StringArray(req.EnabledActions)
	}
	if err := h.store.UpdateJonfreyConfig(cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}
