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
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/store"
)

// JonfreyHandler é o orquestrador AI das automações.
type JonfreyHandler struct {
	store    store.Store
	db       *sqlx.DB
	llmFn    func() llm.Client
	curation *CurationHandler // delega tarefas longas (inspect-all, etc)
}

func NewJonfreyHandler(st store.Store, db *sqlx.DB) *JonfreyHandler {
	return &JonfreyHandler{store: st, db: db}
}

func (h *JonfreyHandler) SetLLMFn(fn func() llm.Client)              { h.llmFn = fn }
func (h *JonfreyHandler) SetCurationHandler(c *CurationHandler)      { h.curation = c }

// ── Catálogo de ações que o Jonfrey pode executar ────────────────────────────

type actionDef struct {
	Type        string
	Description string
	// Run: executa a ação. Retorna (before, after, reasoning, err).
	Run func(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error)
}

var actionRegistry = map[string]actionDef{
	"dispatch_auto_match": {
		Type:        "dispatch_auto_match",
		Description: "Roda o ciclo de auto-match: pontua produtos recentes contra canais ativos e dispara matches acima do threshold",
		Run:         actionDispatchAutoMatch,
	},
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
	"auto_curate_high_confidence": {
		Type:        "auto_curate_high_confidence",
		Description: "Auto-aprova produtos pending com sugestão LLM de alta confiança; rejeita lixo óbvio",
		Run:         actionAutoCurate,
	},
	"detect_failing_channel": {
		Type:        "detect_failing_channel",
		Description: "Detecta canais com CTR ruim ou delivery rate baixo nos últimos 14d e pausa automaticamente",
		Run:         actionDetectFailingChannel,
	},
	"mark_full_groups": {
		Type:        "mark_full_groups",
		Description: "Marca grupos WhatsApp com 1024+ membros como 'full' para entrarem em fallback",
		Run:         actionMarkFullGroups,
	},
	"cleanup_archived_groups": {
		Type:        "cleanup_archived_groups",
		Description: "Arquiva grupos com falhas recorrentes (last_error > 7d e múltiplas falhas)",
		Run:         actionCleanupGroups,
	},
	"audit_affiliate_coverage": {
		Type:        "audit_affiliate_coverage",
		Description: "Detecta marketplaces presentes no catálogo sem programa de afiliado configurado",
		Run:         actionAuditAffiliate,
	},
	"replenish_stagnant_crawlers": {
		Type:        "replenish_stagnant_crawlers",
		Description: "Identifica crawlers ativos sem produtos novos há 7+ dias para review/troca",
		Run:         actionReplenishCrawlers,
	},
}

func actionDispatchAutoMatch(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	// before: contar dispatches nas últimas 24h e produtos elegíveis
	var dispatches24h int
	_ = h.db.GetContext(ctx, &dispatches24h,
		`SELECT COUNT(*) FROM dispatches WHERE created_at > now() - interval '24 hours'`)

	cfg, _ := h.store.GetConfig()
	if !cfg.AutoMatchEnabled {
		return map[string]any{"auto_match_enabled": false},
			map[string]any{"skipped": true},
			"Auto-match está desligado em Configurações. Pulando.",
			nil
	}

	autosCount := 0
	if autos, err := h.store.ListChannelAutomations(true); err == nil {
		autosCount = len(autos)
	}

	beforeMap := map[string]any{
		"dispatches_last_24h":     dispatches24h,
		"automations_enabled":     autosCount,
	}

	if autosCount == 0 {
		return beforeMap,
			map[string]any{"skipped": true, "reason": "no enabled automations"},
			"Nenhuma automação de canal habilitada. Pulando o ciclo.",
			nil
	}

	// Executa o worker (síncrono — captura efeito dentro deste action)
	scheduler.RunAutoMatchWorker(ctx, h.store)

	// after: quantos dispatches saíram desde o início desta action (~ últimos minutos)
	var newDispatches int
	_ = h.db.GetContext(ctx, &newDispatches,
		`SELECT COUNT(*) FROM dispatches WHERE created_at > now() - interval '5 minutes'`)

	afterMap := map[string]any{"new_dispatches": newDispatches}
	reasoning := fmt.Sprintf("Rodei auto-match em %d automações ativas. %d dispatches criados nos últimos 5min.", autosCount, newDispatches)
	return beforeMap, afterMap, reasoning, nil
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

	if h.curation == nil {
		return map[string]any{"pending": pendingCount},
			map[string]any{"started": false},
			"CurationHandler não injetado no Jonfrey — não consigo disparar inspeção.",
			fmt.Errorf("curation handler not wired")
	}

	jobID, started, msg := h.curation.TriggerInspectAll()
	beforeMap := map[string]any{"pending": pendingCount}
	if !started {
		return beforeMap, map[string]any{"started": false, "reason": msg}, msg, nil
	}
	afterMap := map[string]any{"started": true, "job_id": jobID, "queued_for_inspection": min(pendingCount, 30)}
	reasoning := fmt.Sprintf("Encontrei %d produtos sem auditoria. Iniciei job InspectAll (job_id=%s) — LLM vai auditar os próximos 30 em background.", pendingCount, jobID)
	return beforeMap, afterMap, reasoning, nil
}

func actionTuneThresholds(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
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
		Reason       string  `json:"reason"`
	}
	var adjustments []adjustment
	beforeMap := map[string]any{"automations_count": len(autos)}

	for _, a := range autos {
		ch, _ := h.store.GetChannel(a.ChannelID)
		logs, _ := h.store.ListAutoMatchLogsByChannel(a.ChannelID, 50)
		if len(logs) < 5 {
			continue
		}
		threshold := 60.0
		if a.Threshold.Valid {
			threshold = a.Threshold.Float64
		}
		var sum float64
		for _, l := range logs {
			sum += l.Score
		}
		avg := sum / float64(len(logs))

		// Snapshot por canal para o LLM
		var deliveryCount, failedCount int
		_ = h.db.GetContext(ctx, &deliveryCount, `
			SELECT COUNT(*) FROM dispatch_targets dt
			JOIN dispatches d ON d.id = dt.dispatch_id
			WHERE d.channel_id = $1 AND dt.status = 'delivered'
			  AND d.created_at > now() - interval '14 days'`, a.ChannelID)
		_ = h.db.GetContext(ctx, &failedCount, `
			SELECT COUNT(*) FROM dispatch_targets dt
			JOIN dispatches d ON d.id = dt.dispatch_id
			WHERE d.channel_id = $1 AND dt.status = 'failed'
			  AND d.created_at > now() - interval '14 days'`, a.ChannelID)

		prompt := fmt.Sprintf(`Você é um operador sênior otimizando automação de canal de afiliados.

Canal: %s
Threshold atual: %.0f (score min para disparar)
Score médio dos últimos %d logs: %.1f
Disparos entregues últimos 14d: %d
Disparos falhados últimos 14d: %d
Cooldown atual: %dh

Decida se threshold deve mudar e em quanto. Se canal está performando bem (delivery alto, score médio próximo do threshold), mantém. Se score médio muito acima do threshold, abaixa pra disparar mais; se muito abaixo, sobe pra ser mais seletivo.

Responda EXCLUSIVAMENTE em JSON:
{
  "new_threshold": 55,
  "change": true,
  "reason": "explicação breve em 1 frase"
}`,
			ch.Name, threshold, len(logs), avg, deliveryCount, failedCount, a.CooldownHours)

		ctxC, cancel := context.WithTimeout(ctx, 30*time.Second)
		resp, err := cli.Complete(ctxC, prompt, llm.Options{
			MaxTokens: 200, Temperature: 0.2, Operation: "jonfrey_tune_threshold", JSONMode: true,
		})
		cancel()
		if err != nil {
			continue
		}
		var parsed struct {
			NewThreshold float64 `json:"new_threshold"`
			Change       bool    `json:"change"`
			Reason       string  `json:"reason"`
		}
		if err := json.Unmarshal([]byte(resp), &parsed); err != nil {
			continue
		}
		if !parsed.Change || parsed.NewThreshold == threshold {
			continue
		}
		// Sanity bounds
		if parsed.NewThreshold < 20 || parsed.NewThreshold > 95 {
			continue
		}
		a.Threshold = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: parsed.NewThreshold, Valid: true}}
		_ = h.store.UpsertChannelAutomation(a)
		adjustments = append(adjustments, adjustment{
			ChannelID: a.ChannelID, ChannelName: ch.Name,
			FieldChanged: "threshold", OldValue: threshold, NewValue: parsed.NewThreshold,
			Reason: parsed.Reason,
		})
	}

	afterMap := map[string]any{"adjustments": adjustments, "adjusted_count": len(adjustments)}
	reasoning := fmt.Sprintf("LLM avaliou %d automações ativas e recomendou ajuste em %d delas com base em score médio + delivery/failed dos últimos 14 dias.", len(autos), len(adjustments))
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

// ─────────────────────────────────────────────────────────────────────────
// Ações zero-touch (P-Jonfrey extra)
// ─────────────────────────────────────────────────────────────────────────

// actionAutoCurate: auto-aprova produtos pending quando LLM retorna confidence alto.
func actionAutoCurate(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	products, err := h.store.ListPendingCurationProducts(20)
	if err != nil {
		return nil, nil, "", err
	}
	beforeMap := map[string]any{"pending_count": len(products)}
	if len(products) == 0 {
		return beforeMap, map[string]any{"approved": 0, "rejected": 0}, "Nada na fila de curadoria.", nil
	}

	approved, rejected, untouched := 0, 0, 0
	for _, p := range products {
		brand := ""
		if p.Brand.Valid {
			brand = p.Brand.String
		}
		prompt := fmt.Sprintf(`Classifique este produto. Responda JSON com confidence 0..1.
Título: "%s"
Marca atual: "%s"
{"category":"slug","brand":"Nome","tags":["..."],"confidence":0.0}`, p.CanonicalName, brand)
		ctxC, cancel := context.WithTimeout(ctx, 25*time.Second)
		resp, err := cli.Complete(ctxC, prompt, llm.Options{
			MaxTokens: 200, Temperature: 0.1, Operation: "jonfrey_autocurate", JSONMode: true,
		})
		cancel()
		if err != nil {
			untouched++
			continue
		}
		var parsed struct {
			Category   string  `json:"category"`
			Brand      string  `json:"brand"`
			Confidence float64 `json:"confidence"`
		}
		if err := json.Unmarshal([]byte(resp), &parsed); err != nil {
			untouched++
			continue
		}
		switch {
		case parsed.Confidence >= 0.9 && parsed.Brand != "" && parsed.Category != "":
			_, _ = h.db.ExecContext(ctx, `
				UPDATE catalogproduct SET brand=$1, curation_status='curated' WHERE id=$2`,
				parsed.Brand, p.ID)
			approved++
		case parsed.Confidence < 0.4:
			_, _ = h.db.ExecContext(ctx, `
				UPDATE catalogproduct SET curation_status='rejected' WHERE id=$1`, p.ID)
			rejected++
		default:
			untouched++
		}
	}

	afterMap := map[string]any{"approved": approved, "rejected": rejected, "still_pending": untouched}
	reasoning := fmt.Sprintf("Avaliei %d produtos pendentes: %d auto-aprovados (confiança ≥ 90%%), %d rejeitados (confiança < 40%%), %d voltaram pra fila humana.",
		len(products), approved, rejected, untouched)
	return beforeMap, afterMap, reasoning, nil
}

// actionDetectFailingChannel: pausa canais com CTR/delivery rate ruim.
func actionDetectFailingChannel(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	type stat struct {
		ChannelID    int64   `db:"channel_id"`
		ChannelName  string  `db:"channel_name"`
		Total        int64   `db:"total"`
		Delivered    int64   `db:"delivered"`
		Failed       int64   `db:"failed"`
		Clicks       int64   `db:"clicks"`
	}
	var stats []stat
	err := h.db.SelectContext(ctx, &stats, `
		SELECT
		  d.channel_id,
		  COALESCE(c.name, '') AS channel_name,
		  COUNT(dt.id) AS total,
		  COUNT(*) FILTER (WHERE dt.status = 'delivered') AS delivered,
		  COUNT(*) FILTER (WHERE dt.status = 'failed') AS failed,
		  COALESCE(SUM(dt.click_count), 0) AS clicks
		FROM dispatches d
		JOIN dispatch_targets dt ON dt.dispatch_id = d.id
		LEFT JOIN channel c ON c.id = d.channel_id
		WHERE d.created_at > now() - interval '14 days'
		  AND d.channel_id IS NOT NULL
		GROUP BY d.channel_id, c.name
		HAVING COUNT(dt.id) >= 20`)
	if err != nil {
		return nil, nil, "", err
	}

	type paused struct {
		ChannelID    int64   `json:"channel_id"`
		Name         string  `json:"name"`
		DeliveryRate float64 `json:"delivery_rate"`
		CTR          float64 `json:"ctr"`
		Reason       string  `json:"reason"`
	}
	var pausedList []paused

	for _, s := range stats {
		if s.Total == 0 {
			continue
		}
		deliveryRate := float64(s.Delivered) / float64(s.Total)
		ctr := 0.0
		if s.Delivered > 0 {
			ctr = float64(s.Clicks) / float64(s.Delivered)
		}
		reason := ""
		if deliveryRate < 0.70 {
			reason = fmt.Sprintf("delivery rate %.1f%%", deliveryRate*100)
		} else if ctr < 0.005 && s.Delivered >= 50 {
			reason = fmt.Sprintf("CTR %.2f%%", ctr*100)
		}
		if reason == "" {
			continue
		}
		// pausa: desliga a automação do canal
		auto, err := h.store.GetChannelAutomation(s.ChannelID)
		if err != nil || auto == nil || !auto.Enabled {
			continue
		}
		auto.Enabled = false
		_ = h.store.UpsertChannelAutomation(*auto)
		pausedList = append(pausedList, paused{
			ChannelID: s.ChannelID, Name: s.ChannelName,
			DeliveryRate: deliveryRate, CTR: ctr, Reason: reason,
		})
	}

	beforeMap := map[string]any{"channels_evaluated": len(stats)}
	afterMap := map[string]any{"paused": pausedList, "paused_count": len(pausedList)}
	reasoning := fmt.Sprintf("Avaliei %d canais com pelo menos 20 disparos nos últimos 14 dias. Pausei %d com delivery rate < 70%% ou CTR < 0.5%%.", len(stats), len(pausedList))
	return beforeMap, afterMap, reasoning, nil
}

// actionMarkFullGroups: marca grupos com 1024+ membros como 'full'.
func actionMarkFullGroups(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	var candidates int
	_ = h.db.GetContext(ctx, &candidates,
		`SELECT COUNT(*) FROM groups WHERE platform = 'whatsapp' AND member_count >= 1024 AND status = 'active'`)

	res, err := h.db.ExecContext(ctx, `
		UPDATE groups SET status = 'full'
		WHERE platform = 'whatsapp' AND member_count >= 1024 AND status = 'active'`)
	if err != nil {
		return nil, nil, "", err
	}
	updated, _ := res.RowsAffected()

	beforeMap := map[string]any{"candidates_active_at_limit": candidates}
	afterMap := map[string]any{"marked_full": updated}
	reasoning := fmt.Sprintf("Encontrei %d grupos WhatsApp ativos com 1024+ membros (limite WA). Marquei %d como 'full' — agora entram automaticamente em fallback chains.", candidates, updated)
	return beforeMap, afterMap, reasoning, nil
}

// actionCleanupGroups: arquiva grupos com falhas recorrentes.
func actionCleanupGroups(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	type row struct {
		ID   int64  `db:"id"`
		Name string `db:"name"`
	}
	var candidates []row
	err := h.db.SelectContext(ctx, &candidates, `
		SELECT g.id, g.name
		FROM groups g
		WHERE g.archived = false
		  AND g.last_error_at IS NOT NULL
		  AND g.last_error_at < now() - interval '7 days'
		  AND EXISTS (
		      SELECT 1 FROM dispatch_targets dt
		      WHERE dt.group_id = g.id
		        AND dt.status = 'failed'
		        AND dt.created_at > now() - interval '14 days'
		      GROUP BY dt.group_id HAVING COUNT(*) >= 3
		  )`)
	if err != nil {
		return nil, nil, "", err
	}

	archived := 0
	for _, c := range candidates {
		_, err := h.db.ExecContext(ctx, `UPDATE groups SET archived = true WHERE id = $1`, c.ID)
		if err == nil {
			archived++
		}
	}

	beforeMap := map[string]any{"candidates": candidates}
	afterMap := map[string]any{"archived": archived}
	reasoning := fmt.Sprintf("Achei %d grupos com last_error_at > 7d e ≥3 falhas nos últimos 14d. Arquivei %d.", len(candidates), archived)
	return beforeMap, afterMap, reasoning, nil
}

// actionAuditAffiliate: detecta marketplaces sem programa de afiliado configurado.
func actionAuditAffiliate(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	type row struct {
		Source string `db:"source"`
		Count  int64  `db:"count"`
	}
	var marketplaces []row
	err := h.db.SelectContext(ctx, &marketplaces, `
		SELECT lowest_price_source AS source, COUNT(*) AS count
		FROM catalogproduct
		WHERE lowest_price_source IS NOT NULL
		  AND lowest_price_source <> ''
		GROUP BY lowest_price_source
		ORDER BY count DESC`)
	if err != nil {
		return nil, nil, "", err
	}

	programs, _ := h.store.ListAffiliatePrograms(nil)
	type missing struct {
		Marketplace  string `json:"marketplace"`
		ProductCount int64  `json:"product_count"`
	}
	var missingList []missing
	for _, m := range marketplaces {
		// usa helper de affiliates: HasAffiliate verifica programa + credenciais válidas
		hasAny := false
		for _, p := range programs {
			if p.Marketplace == m.Source {
				hasAny = true
				break
			}
		}
		if !hasAny {
			missingList = append(missingList, missing{Marketplace: m.Source, ProductCount: m.Count})
		}
	}

	beforeMap := map[string]any{"marketplaces_in_catalog": len(marketplaces), "configured_programs": len(programs)}
	afterMap := map[string]any{"missing_coverage": missingList}
	reasoning := fmt.Sprintf("Catálogo tem %d marketplaces ativos. %d sem programa de afiliado configurado — cada produto sem código não gera comissão.",
		len(marketplaces), len(missingList))
	if len(missingList) == 0 {
		reasoning = fmt.Sprintf("Cobertura completa: todos os %d marketplaces do catálogo têm programa de afiliado configurado.", len(marketplaces))
	}
	return beforeMap, afterMap, reasoning, nil
}

// actionReplenishCrawlers: identifica crawlers ativos sem produtos novos há 7+ dias.
func actionReplenishCrawlers(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	type row struct {
		ID            int64  `db:"id"`
		Query         string `db:"query"`
		LastResultAt  *time.Time `db:"last_result_at"`
	}
	var stagnant []row
	err := h.db.SelectContext(ctx, &stagnant, `
		SELECT st.id, st.query,
		       (SELECT MAX(cr.created_at) FROM crawl_results cr WHERE cr.search_term_id = st.id) AS last_result_at
		FROM search_terms st
		WHERE st.active = true
		  AND (
		      NOT EXISTS (SELECT 1 FROM crawl_results cr WHERE cr.search_term_id = st.id AND cr.created_at > now() - interval '7 days')
		  )`)
	if err != nil {
		// crawl_results pode não existir ou ter outro nome — não falhar a ação
		return map[string]any{"checked": false, "error": err.Error()},
			map[string]any{"stagnant": []any{}},
			"Não consegui consultar crawl_results — verifique schema (tabela pode ter nome diferente).",
			nil
	}

	type item struct {
		ID    int64  `json:"id"`
		Query string `json:"query"`
		LastResultAt *time.Time `json:"last_result_at"`
	}
	out := make([]item, 0, len(stagnant))
	for _, s := range stagnant {
		out = append(out, item{ID: s.ID, Query: s.Query, LastResultAt: s.LastResultAt})
	}

	beforeMap := map[string]any{"active_crawlers_checked": "all"}
	afterMap := map[string]any{"stagnant_crawlers": out, "count": len(out)}
	reasoning := fmt.Sprintf("Encontrei %d crawler(s) ativo(s) sem trazer produto novo há 7+ dias. Considere ajustar query ou desativar — entrou no audit pra você revisar.", len(out))
	return beforeMap, afterMap, reasoning, nil
}
