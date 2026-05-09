package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"snatcher/backendv2/internal/clusters"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
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
	Category    string // cleanup, curation, dispatch, optimization, health, admin
	UsesLLM     bool // true = usa LLM (lento, custo); false = heurística/SQL pura (rápido, grátis)
	// Run: executa a ação. Retorna (before, after, reasoning, err).
	Run func(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error)
}

var actionRegistry = map[string]actionDef{
	"inspect_pending_products": {
		Type:        "inspect_pending_products",
		Category:    "curation",
		Description: "Audita via LLM os próximos 30 produtos não inspecionados",
		UsesLLM:     true,
		Run:         actionInspectPending,
	},
	"tune_thresholds": {
		Type:        "tune_thresholds",
		Category:    "optimization",
		Description: "Avalia performance de cada automação ativa e ajusta thresholds via LLM",
		UsesLLM:     true,
		Run:         actionTuneThresholds,
	},
	"auto_curate_high_confidence": {
		Type:        "auto_curate_high_confidence",
		Category:    "curation",
		Description: "Auto-aprova produtos pending com sugestão LLM de alta confiança; rejeita lixo óbvio",
		UsesLLM:     true,
		Run:         actionAutoCurate,
	},
	"detect_failing_channel": {
		Type:        "detect_failing_channel",
		Category:    "health",
		Description: "Detecta canais com CTR ruim ou delivery rate baixo nos últimos 14d e pausa automaticamente",
		UsesLLM:     false,
		Run:         actionDetectFailingChannel,
	},
	"manage_group_health": {
		Type:        "manage_group_health",
		Category:    "cleanup",
		Description: "Marca grupos WhatsApp com 1024+ membros como 'full' para fallback e arquiva grupos com falhas recorrentes (last_error > 7d e múltiplas falhas)",
		UsesLLM:     false,
		Run:         actionManageGroupHealth,
	},
	"audit_affiliate_coverage": {
		Type:        "audit_affiliate_coverage",
		Category:    "health",
		Description: "Detecta marketplaces presentes no catálogo sem programa de afiliado configurado",
		UsesLLM:     false,
		Run:         actionAuditAffiliate,
	},
	"replenish_stagnant_crawlers": {
		Type:        "replenish_stagnant_crawlers",
		Category:    "health",
		Description: "Identifica crawlers ativos sem produtos novos há 7+ dias para review/troca",
		UsesLLM:     false,
		Run:         actionReplenishCrawlers,
	},
	"maintain_taxonomy": {
		Type:        "maintain_taxonomy",
		Category:    "curation",
		Description: "Consolida marcas e categorias duplicadas; revisa taxonomia pendente: aprova, rejeita, melhora keywords e funde entradas para maximizar match heurístico",
		UsesLLM:     true,
		Run:         actionMaintainTaxonomy,
	},
	"auto_release_pending": {
		Type:        "auto_release_pending",
		Category:    "dispatch",
		Description: "Quando full_auto_mode estiver ON, libera todos os dispatches em pending_approval para envio. Roda no ciclo regular do auto-pilot",
		UsesLLM:     false,
		Run:         actionAutoReleasePending,
	},
	"reset_stale_cooldown": {
		Type:        "reset_stale_cooldown",
		Category:    "cleanup",
		Description: "Limpa cooldown de produtos cujos dispatches nunca foram entregues (pending_approval ou failed) — desbloqueia fila de auto-match imediatamente",
		UsesLLM:     false,
		Run:         actionResetStaleCooldown,
	},
	"cleanup_dispatch_queue": {
		Type:        "cleanup_dispatch_queue",
		Category:    "cleanup",
		Description: "Remove dispatches duplicados na fila (mesmo produto+canal) mantendo o mais recente, depois marca targets pending há mais de 2h como failed",
		UsesLLM:     false,
		Run:         actionCleanupDispatchQueue,
	},
	"archive_old_logs": {
		Type:        "archive_old_logs",
		Category:    "cleanup",
		Description: "Remove auto_match_logs com mais de 30 dias de idade para liberar espaço",
		UsesLLM:     false,
		Run:         actionArchiveOldLogs,
	},
	"compute_clusters": {
		Type:        "compute_clusters",
		Category:    "optimization",
		Description: "Computa clusters de produtos similares usando LLM para otimizar matching",
		UsesLLM:     true,
		Run:         actionComputeClusters,
	},
	"optimize_audience_from_clicks": {
		Type:        "optimize_audience_from_clicks",
		Category:    "optimization",
		Description: "Analisa cliques recentes por canal e otimiza audience (categorias e marcas) via LLM com confiança alta",
		UsesLLM:     true,
		Run:         actionOptimizeAudienceFromClicks,
	},
	"purge_inactive_products": {
		Type:        "purge_inactive_products",
		Category:    "cleanup",
		Description: "Remove produtos marcados como inativos com mais de 60 dias sem atualização",
		UsesLLM:     false,
		Run:         actionPurgeInactiveProducts,
	},
	"pause_dead_crawlers": {
		Type:        "pause_dead_crawlers",
		Category:    "health",
		Description: "Pausa searchterms ativos que não retornam resultados há 14+ dias (5+ logs com result_count=0)",
		UsesLLM:     false,
		Run:         actionPauseDeadCrawlers,
	},
	"enrich_taxonomy_from_unmatched": {
		Type:        "enrich_taxonomy_from_unmatched",
		Category:    "curation",
		Description: "Audita próximos 100 produtos sem categoria primária; agrupa por similaridade de título; sugere via LLM novas taxonomias + patterns se confiança ≥0.85",
		UsesLLM:     true,
		Run:         actionEnrichTaxonomyFromUnmatched,
	},
	"prune_false_positives": {
		Type:        "prune_false_positives",
		Category:    "curation",
		Description: "Top 20 taxonomias flagged como falso positivo nos últimos 30 dias; sugere exclude_regex patterns via LLM para cada",
		UsesLLM:     true,
		Run:         actionPruneFalsePositives,
	},
	"refine_subcategories": {
		Type:        "refine_subcategories",
		Category:    "optimization",
		Description: "Para cada categoria-raiz com >100 produtos sem subcategoria, LLM agrupa 50 amostras em 3-7 subcategorias coerentes; aplica se confiança ≥0.85",
		UsesLLM:     true,
		Run:         actionRefineSubcategories,
	},
}

// ── Ações ──────────────────────────────────────────────────────────────────

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
		var clicksOnDelivered int
		_ = h.db.GetContext(ctx, &clicksOnDelivered, `
			SELECT COALESCE(SUM(dt.click_count), 0) FROM dispatch_targets dt
			JOIN dispatches d ON d.id = dt.dispatch_id
			WHERE d.channel_id = $1 AND dt.status = 'delivered'
			  AND d.created_at > now() - interval '14 days'`, a.ChannelID)
		ctr := 0.0
		if deliveryCount > 0 {
			ctr = float64(clicksOnDelivered) / float64(deliveryCount)
		}

		prompt := fmt.Sprintf(`Otimize threshold de automação (só estes dados locais).

Canal: %s
Threshold atual: %.0f (score mín. p/ disparar)
Score médio (últimos %d logs auto-match): %.1f
Targets entregues 14d / falhos 14d: %d / %d
CTR aprox.: %.3f (cliques em targets delivered / número de targets delivered)
Cooldown: %dh

Regra: alta taxa falha ou CTR baixíssimo pode pedir threshold mais alto (mais seletivo). Score médio estável bem acima do threshold pode baixar levemente (mais disparos).

JSON apenas:
{"new_threshold":55,"change":false,"reason":"uma frase"}`,
			ch.Name, threshold, len(logs), avg, deliveryCount, failedCount, ctr, a.CooldownHours)

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
		Category    string `json:"category"`
		Description string `json:"description"`
		UsesLLM     bool   `json:"uses_llm"`
	}
	out := []item{}
	for _, a := range actionRegistry {
		out = append(out, item{Type: a.Type, Category: a.Category, Description: a.Description, UsesLLM: a.UsesLLM})
	}
	writeJSON(w, http.StatusOK, out)
}

// RunCycle executa todas as actions habilitadas no JonfreyConfig, ordenadas por categoria.
// Ordem: cleanup → curation → health → optimization → dispatch
func (h *JonfreyHandler) RunCycle(ctx context.Context) {
	cfg, err := h.store.GetJonfreyConfig()
	if err != nil || !cfg.Enabled {
		return
	}

	// Executa ações em ordem de categoria
	order := []string{"cleanup", "curation", "health", "optimization", "dispatch"}
	for _, cat := range order {
		for _, t := range []string(cfg.EnabledActions) {
			def, ok := actionRegistry[t]
			if !ok || def.Category != cat {
				continue
			}
			_ = h.executeAction(ctx, def, "scheduler", "")
		}
	}

	cfg.LastRunAt = models.NullTime{NullTime: sql.NullTime{Time: time.Now(), Valid: true}}
	_ = h.store.UpdateJonfreyConfig(cfg)
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
		mkt := ""
		if p.LowestPriceSource.Valid {
			mkt = strings.TrimSpace(p.LowestPriceSource.String)
		}
		tags := strings.Join(p.GetTags(), ",")
		if len(tags) > 180 {
			tags = tags[:180] + "…"
		}
		priceStr := ""
		if p.LowestPrice.Valid {
			priceStr = fmt.Sprintf("%.2f", p.LowestPrice.Float64)
		}
		prompt := fmt.Sprintf(`Classifique para curadoria. Só dados abaixo. JSON estrito confidence 0..1.
titulo:%q marca:%q marketplace:%q preco_low:%s tags_csv:%s
{"category":"slug","brand":"Nome","tags":[""],"confidence":0.0}`,
			p.CanonicalName, brand, mkt, priceStr, tags)
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

// actionManageGroupHealth: marca grupos em 'full' e arquiva grupos com falhas recorrentes.
// Combina mark_full_groups e cleanup_archived_groups numa única action.
func actionManageGroupHealth(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	// Passo 1: marcar grupos com 1024+ membros como 'full'
	var candidatesFull int
	_ = h.db.GetContext(ctx, &candidatesFull,
		`SELECT COUNT(*) FROM groups WHERE platform = 'whatsapp' AND member_count >= 1024 AND status = 'active'`)

	resFull, err := h.db.ExecContext(ctx, `
		UPDATE groups SET status = 'full'
		WHERE platform = 'whatsapp' AND member_count >= 1024 AND status = 'active'`)
	if err != nil {
		return nil, nil, "", err
	}
	markedFull, _ := resFull.RowsAffected()

	// Passo 2: arquivar grupos com falhas recorrentes
	type row struct {
		ID   int64  `db:"id"`
		Name string `db:"name"`
	}
	var candidates []row
	err = h.db.SelectContext(ctx, &candidates, `
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

	beforeMap := map[string]any{"candidates_full": candidatesFull, "candidates_archived": len(candidates)}
	afterMap := map[string]any{"marked_full": markedFull, "archived": archived}
	reasoning := fmt.Sprintf("Encontrei %d grupos WhatsApp ativos com 1024+ membros — marquei como 'full'. Achei %d grupos com last_error_at > 7d e ≥3 falhas nos últimos 14d — arquivei %d.", candidatesFull, len(candidates), archived)
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

// actionCleanupDispatchQueue: remove duplicatas da fila (mesmo produto+canal) depois marca targets stale como failed.
// Combina dedup_pending e expire_stale_dispatches numa única action.
func actionCleanupDispatchQueue(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	// Passo 1: remover duplicatas
	resDedup, err := h.db.ExecContext(ctx, `
		UPDATE dispatches SET status = 'rejected'
		WHERE id IN (
			SELECT d.id FROM dispatches d
			JOIN auto_match_logs aml ON aml.dispatch_id = d.id
			WHERE d.status IN ('pending_approval', 'queued')
			  AND d.id NOT IN (
			      SELECT (
			          SELECT d2.id FROM dispatches d2
			          JOIN auto_match_logs aml2 ON aml2.dispatch_id = d2.id
			          WHERE aml2.product_id = aml.product_id
			            AND aml2.channel_id = aml.channel_id
			            AND d2.status IN ('pending_approval', 'queued')
			          ORDER BY d2.created_at DESC
			          LIMIT 1
			      )
			      FROM auto_match_logs aml
			      GROUP BY aml.product_id, aml.channel_id
			  )
		)`)
	if err != nil {
		return nil, nil, "", fmt.Errorf("dedup: %w", err)
	}
	dedupedCount, _ := resDedup.RowsAffected()

	// Passo 2: contar e expirar targets stale
	var beforeStale int
	_ = h.db.GetContext(ctx, &beforeStale, `
		SELECT COUNT(*) FROM dispatch_targets
		WHERE status = 'pending' AND created_at < now() - interval '2 hours'`)

	resExpire, err := h.db.ExecContext(ctx, `
		UPDATE dispatch_targets
		SET status = 'failed',
		    error_reason = 'expirado pelo Jonfrey'
		WHERE status = 'pending'
		  AND created_at < now() - interval '2 hours'`)
	if err != nil {
		return nil, nil, "", err
	}
	expiredCount, _ := resExpire.RowsAffected()

	beforeMap := map[string]any{"stale_pending_count": beforeStale}
	afterMap := map[string]any{"rejected_duplicates": dedupedCount, "expired": expiredCount}
	reasoning := fmt.Sprintf("Removi %d dispatches duplicados na fila. Marquei %d targets travados em pending há mais de 2h como failed para liberar a fila.", dedupedCount, expiredCount)
	return beforeMap, afterMap, reasoning, nil
}

// actionMaintainTaxonomy: consolida marcas e categorias duplicadas e revisa taxonomia pendente.
// Combina dedup_brands_categories e curate_taxonomy numa única action com 1 chamada LLM.
func actionMaintainTaxonomy(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	// Coleta dados do catálogo e taxonomia pendente
	type strRow struct{ Val string `db:"val"` }
	var brandRows, tagRows []strRow

	// Marcas/tags mais frequentes no catálogo (menos tokens que DISTINCT aleatório, melhor pra dedupe).
	_ = h.db.SelectContext(ctx, &brandRows, `
		SELECT brand AS val FROM catalogproduct
		WHERE brand IS NOT NULL AND brand != '' AND inactive = false
		GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 70`)

	_ = h.db.SelectContext(ctx, &tagRows, `
		SELECT t AS val FROM (
			SELECT jsonb_array_elements_text(tags) AS t FROM catalogproduct
			WHERE tags IS NOT NULL AND tags != '[]'::jsonb AND inactive = false
		) sub
		GROUP BY t ORDER BY COUNT(*) DESC LIMIT 70`)

	brands := make([]string, 0, len(brandRows))
	for _, r := range brandRows { brands = append(brands, r.Val) }
	tags := make([]string, 0, len(tagRows))
	for _, r := range tagRows { tags = append(tags, r.Val) }

	// Carrega entradas de taxonomia pendente e aprovadas
	pending, _ := h.store.ListPendingTaxonomy()
	approved, _ := h.store.ListTaxonomy("")

	type compactEntry struct {
		ID       int64    `json:"id"`
		Type     string   `json:"type"`
		Name     string   `json:"name"`
		Keywords []string `json:"keywords"`
	}
	compactPending := make([]compactEntry, 0, len(pending))
	for _, t := range pending {
		compactPending = append(compactPending, compactEntry{
			ID:       t.ID,
			Type:     t.Type,
			Name:     t.Name,
			Keywords: capJonfreyKeywords([]string(t.Keywords), 8, 56),
		})
	}
	compactApproved := make([]compactEntry, 0, len(approved))
	for _, t := range approved {
		compactApproved = append(compactApproved, compactEntry{
			ID:       t.ID,
			Type:     t.Type,
			Name:     t.Name,
			Keywords: capJonfreyKeywords([]string(t.Keywords), 8, 56),
		})
	}
	if len(compactPending) > 36 {
		compactPending = compactPending[:36]
	}
	if len(compactApproved) > 32 {
		compactApproved = compactApproved[:32]
	}

	brandsJSON, _ := json.Marshal(brands)
	tagsJSON, _ := json.Marshal(tags)
	apprJSON, _ := json.Marshal(compactApproved)
	pendJSON, _ := json.Marshal(compactPending)

	// Prompt compacto — mesmo schema de saída; entrada via JSON diminui verbosidade de %v Go.
	prompt := fmt.Sprintf(`Curador taxonomia + dedupe (somente dados JSON abaixo, promoções BR).

TOP Marcas freq n=%d: %s
TOP Tags freq n=%d: %s
Aprovadas (amostra n=%d): %s
Pendentes (n=%d): %s

1) brand_groups / tag_groups: canonical + aliases, só onde ≥2 duplicados/near-dup úteis.
2) taxonomy_decisions: cada pendente com action approve | reject | merge_into (merge_id) | approve_with_keywords (extra_keywords).

JSON apenas:
{"brand_groups":[{"canonical":"","aliases":["",""]}],"tag_groups":[{"canonical":"","aliases":["",""]}],"taxonomy_decisions":[{"id":1,"action":"approve"}]}
`,
		len(brands), brandsJSON, len(tags), tagsJSON,
		len(compactApproved), apprJSON,
		len(compactPending), pendJSON)

	ctxC, cancel := context.WithTimeout(ctx, 60*time.Second)
	resp, err := cli.Complete(ctxC, prompt, llm.Options{
		MaxTokens:   1700,
		Temperature: 0.1,
		Operation:   "jonfrey_maintain_taxonomy",
		JSONMode:    true,
	})
	cancel()
	if err != nil {
		return nil, nil, "", fmt.Errorf("LLM: %w", err)
	}

	var parsed struct {
		BrandGroups []struct {
			Canonical string   `json:"canonical"`
			Aliases   []string `json:"aliases"`
		} `json:"brand_groups"`
		TagGroups []struct {
			Canonical string   `json:"canonical"`
			Aliases   []string `json:"aliases"`
		} `json:"tag_groups"`
		TaxonomyDecisions []struct {
			ID            int64    `json:"id"`
			Action        string   `json:"action"`
			MergeInto     int64    `json:"merge_id"`
			ExtraKeywords []string `json:"extra_keywords"`
		} `json:"taxonomy_decisions"`
	}
	if err := json.Unmarshal([]byte(resp), &parsed); err != nil {
		return nil, nil, "", fmt.Errorf("parse: %w", err)
	}

	brandsMerged, tagsMerged := 0, 0

	// Consolida marcas
	for _, g := range parsed.BrandGroups {
		if len(g.Aliases) == 0 || g.Canonical == "" { continue }
		placeholders := ""
		args := []any{g.Canonical}
		for i, a := range g.Aliases {
			if i > 0 { placeholders += "," }
			placeholders += fmt.Sprintf("$%d", i+2)
			args = append(args, a)
		}
		res, _ := h.db.ExecContext(ctx,
			fmt.Sprintf(`UPDATE catalogproduct SET brand = $1 WHERE brand IN (%s)`, placeholders), args...)
		if n, _ := res.RowsAffected(); n > 0 { brandsMerged++ }
	}

	// Consolida categorias
	for _, g := range parsed.TagGroups {
		if len(g.Aliases) == 0 || g.Canonical == "" { continue }
		for _, alias := range g.Aliases {
			_, _ = h.db.ExecContext(ctx, `
				UPDATE catalogproduct
				SET tags = (
					SELECT jsonb_agg(CASE WHEN elem = $1 THEN $2::text ELSE elem END)
					FROM jsonb_array_elements_text(tags) AS elem
				)
				WHERE tags @> $3::jsonb`, alias, g.Canonical, fmt.Sprintf(`[%q]`, alias))
			tagsMerged++
		}
	}

	// Processa decisões de taxonomia
	pendingByID := make(map[int64]models.Taxonomy, len(pending))
	for _, t := range pending { pendingByID[t.ID] = t }
	approvedByID := make(map[int64]models.Taxonomy, len(approved))
	for _, t := range approved { approvedByID[t.ID] = t }

	approved_count, rejected_count, merged_count, enriched_count := 0, 0, 0, 0

	for _, d := range parsed.TaxonomyDecisions {
		t, ok := pendingByID[d.ID]
		if !ok { continue }

		switch d.Action {
		case "approve":
			_ = h.store.SetTaxonomyStatus(t.ID, "approved")
			approved_count++

		case "reject":
			_ = h.store.SetTaxonomyStatus(t.ID, "rejected")
			rejected_count++

		case "merge_into":
			target, ok := approvedByID[d.MergeInto]
			if !ok { break }
			seen := map[string]bool{}
			for _, k := range target.Keywords { seen[k] = true }
			added := false
			for _, k := range t.Keywords {
				if !seen[strings.ToLower(k)] {
					target.Keywords = append(target.Keywords, k)
					seen[strings.ToLower(k)] = true
					added = true
				}
			}
			if added {
				_ = h.store.UpdateTaxonomy(target)
			}
			_ = h.store.SetTaxonomyStatus(t.ID, "rejected")
			merged_count++

		case "approve_with_keywords":
			seen := map[string]bool{}
			for _, k := range t.Keywords { seen[strings.ToLower(k)] = true }
			for _, k := range d.ExtraKeywords {
				if k != "" && !seen[strings.ToLower(k)] {
					t.Keywords = append(t.Keywords, k)
					seen[strings.ToLower(k)] = true
				}
			}
			t.Active = true
			_ = h.store.UpdateTaxonomy(t)
			_ = h.store.SetTaxonomyStatus(t.ID, "approved")
			enriched_count++
		}
	}

	beforeMap := map[string]any{
		"brands_evaluated": len(brands), "tags_evaluated": len(tags),
		"pending_taxonomy": len(pending), "approved_taxonomy": len(approved),
	}
	afterMap := map[string]any{
		"brand_groups_found": len(parsed.BrandGroups),
		"tag_groups_found":   len(parsed.TagGroups),
		"brands_merged":      brandsMerged,
		"tags_merged":        tagsMerged,
		"taxonomy_approved":  approved_count,
		"taxonomy_rejected":  rejected_count,
		"taxonomy_merged":    merged_count,
		"taxonomy_enriched":  enriched_count,
	}
	reasoning := fmt.Sprintf(
		"LLM consolidou %d marcas+%d categorias do catálogo (encontrou %d grupos marca + %d grupos categoria duplicadas). Revisei %d entradas de taxonomia: %d aprovadas, %d rejeitadas, %d fundidas, %d enriquecidas.",
		len(brands), len(tags), len(parsed.BrandGroups), len(parsed.TagGroups),
		len(pending), approved_count, rejected_count, merged_count, enriched_count,
	)
	return beforeMap, afterMap, reasoning, nil
}

// actionAutoReleasePending: libera dispatches em pending_approval se full_auto_mode estiver ON.
// Permite que o Jonfrey faça o auto-release sozinho no ciclo regular.
func actionAutoReleasePending(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	cfg, err := h.store.GetConfig()
	if err != nil {
		return nil, nil, "", err
	}
	if !cfg.FullAutoMode {
		return map[string]any{"full_auto_mode": false},
			map[string]any{"released": 0, "skipped": "full_auto_mode desligado"},
			"Full-auto desligado — sem release automático. Aprove manualmente ou ative em Configurações.",
			nil
	}
	var before int
	_ = h.db.GetContext(ctx, &before, `SELECT COUNT(*) FROM dispatches WHERE status = 'pending_approval'`)
	res, err := h.db.ExecContext(ctx, `UPDATE dispatches SET status = 'queued' WHERE status = 'pending_approval'`)
	if err != nil {
		return nil, nil, "", err
	}
	released, _ := res.RowsAffected()
	beforeMap := map[string]any{"pending_approval_count": before}
	afterMap := map[string]any{"released": released, "now_status": "queued"}
	reasoning := fmt.Sprintf("Full-auto ON. Liberei %d dispatches que estavam em pending_approval. O dispatch worker enviará respeitando rotação de contas WA e throttling.", released)
	return beforeMap, afterMap, reasoning, nil
}


// actionResetStaleCooldown: remove auto_match_logs de dispatches não entregues
// (pending_approval, failed, pending sem entrega) para desbloquear a fila de auto-match.
func actionResetStaleCooldown(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	var before int
	_ = h.db.GetContext(ctx, &before, `SELECT COUNT(*) FROM auto_match_logs`)

	// Remove logs de dispatches não entregues: pending_approval, queued, pending (em fila mas não chegou), failed
	res, err := h.db.ExecContext(ctx, `
		DELETE FROM auto_match_logs
		WHERE dispatch_id IN (
			SELECT d.id FROM dispatches d
			WHERE d.status IN ('pending_approval', 'failed', 'cancelled')
			   OR NOT EXISTS (
			       SELECT 1 FROM dispatch_targets dt
			       WHERE dt.dispatch_id = d.id AND dt.status = 'delivered'
			   )
		)`)
	if err != nil {
		return nil, nil, "", err
	}
	removed, _ := res.RowsAffected()

	var after int
	_ = h.db.GetContext(ctx, &after, `SELECT COUNT(*) FROM auto_match_logs`)

	beforeMap := map[string]any{"logs_before": before}
	afterMap := map[string]any{"removed": removed, "logs_after": after}
	reasoning := fmt.Sprintf("Removi %d logs de cooldown de dispatches não entregues. Produtos destas tentativas voltam ao pool pra o próximo ciclo de auto-match.", removed)
	return beforeMap, afterMap, reasoning, nil
}

// actionArchiveOldLogs: remove auto_match_logs com mais de 30 dias
func actionArchiveOldLogs(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	var before int
	_ = h.db.GetContext(ctx, &before, `SELECT COUNT(*) FROM auto_match_logs`)

	res, err := h.db.ExecContext(ctx, `
		DELETE FROM auto_match_logs
		WHERE created_at < now() - interval '30 days'`)
	if err != nil {
		return nil, nil, "", err
	}
	deleted, _ := res.RowsAffected()

	var after int
	_ = h.db.GetContext(ctx, &after, `SELECT COUNT(*) FROM auto_match_logs`)

	beforeMap := map[string]any{"logs_before": before}
	afterMap := map[string]any{"deleted": deleted, "logs_after": after}
	reasoning := fmt.Sprintf("Arquivei e removi %d logs com mais de 30 dias para liberar espaço no banco.", deleted)
	return beforeMap, afterMap, reasoning, nil
}

// actionComputeClusters: computa clusters de produtos similares via LLM
func actionComputeClusters(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	ctxC, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	err := clusters.Compute(ctxC, h.store, cli)
	if err != nil {
		return nil, nil, "", fmt.Errorf("clusters.Compute: %w", err)
	}

	beforeMap := map[string]any{"status": "started"}
	afterMap := map[string]any{"status": "completed"}
	reasoning := "Executei clusters.Compute para otimizar agrupamento de produtos similares para matching."
	return beforeMap, afterMap, reasoning, nil
}

// actionOptimizeAudienceFromClicks: analisa cliques recentes e otimiza audience dos canais via LLM
func actionOptimizeAudienceFromClicks(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	// Listar canais ativos
	channels, err := h.store.ListChannels()
	if err != nil {
		return nil, nil, "", err
	}

	type channelClickData struct {
		ChannelID      int64
		ChannelName    string
		ClickCount     int64
		ProductClicks  []struct {
			ProductID  int64
			ClickCount int64
			Brand      string
			Categories string // delimitado por vírgula
		}
	}

	var channelsWithClicks []channelClickData
	var updateCount int

	for _, ch := range channels {
		if !ch.Active {
			continue
		}

		// Query: cliques dos últimos 7 dias, agrupado por product_id
		type clickRow struct {
			ProductID  int64  `db:"product_id"`
			ClickCount int64  `db:"click_count"`
		}
		var clicks []clickRow
		err := h.db.SelectContext(ctx, &clicks, `
			SELECT product_id, COUNT(*) as click_count
			FROM shortlink_clicks
			WHERE channel_id = $1 AND clicked_at > now() - interval '7 days'
			GROUP BY product_id
			ORDER BY click_count DESC
		`, ch.ID)
		if err != nil {
			continue
		}

		totalClicks := int64(0)
		for _, c := range clicks {
			totalClicks += c.ClickCount
		}

		// Skip se menos de 20 cliques
		if totalClicks < 20 {
			continue
		}

		channelsWithClicks = append(channelsWithClicks, channelClickData{
			ChannelID:   ch.ID,
			ChannelName: ch.Name,
			ClickCount:  totalClicks,
		})

		// Top-N cliques por produto — evita prompt enorme e N+1 quando há muitos SKUs
		if len(clicks) > 28 {
			clicks = clicks[:28]
		}

		// Buscar detalhes dos produtos clicados
		var productDetails []struct {
			ProductID  int64
			ClickCount int64
			Brand      string
			Categories string
		}

		for _, c := range clicks {
			var p models.CatalogProduct
			if err := h.db.GetContext(ctx, &p, `
				SELECT id, brand, tags FROM catalogproduct WHERE id = $1
			`, c.ProductID); err == nil {
				brand := ""
				if p.Brand.Valid {
					brand = p.Brand.String
				}
				tags := strings.Join(p.GetTags(), ",")
				if len(tags) > 160 {
					tags = tags[:160] + "…"
				}
				productDetails = append(productDetails, struct {
					ProductID  int64
					ClickCount int64
					Brand      string
					Categories string
				}{
					ProductID:  c.ProductID,
					ClickCount: c.ClickCount,
					Brand:      brand,
					Categories: tags,
				})
			}
		}

		// Snapshot antes
		beforeJSON, _ := json.Marshal(ch.Audience)

		// Montar prompt para LLM
		type prodClick struct {
			ID         int64  `json:"id"`
			Clicks     int64  `json:"clicks"`
			Brand      string `json:"brand"`
			Categories string `json:"categories"`
		}
		var prods []prodClick
		for _, p := range productDetails {
			prods = append(prods, prodClick{
				ID:         p.ProductID,
				Clicks:     p.ClickCount,
				Brand:      p.Brand,
				Categories: p.Categories,
			})
		}
		prodsJSON, _ := json.Marshal(prods)

		currentAudienceJSON, _ := json.Marshal(ch.Audience)

		prompt := fmt.Sprintf(`Ajuste audiência de canal (somente dados JSON abaixo).

canal:%s cliques_7d:%d

audiencia_atual:%s

top_produtos_cliques:%s

Proponha só movimentos óbvios entre categorias/marcas. confidence≥0.85 aplica automático; senão arrays vazios e confidence baixa.

JSON:{"categories_to_add":[],"categories_to_remove":[],"brands_to_add":[],"brands_to_remove":[],"confidence":0.0,"reasoning":"curta"}`,
			ch.Name, totalClicks, string(currentAudienceJSON), string(prodsJSON))

		ctxC, cancel := context.WithTimeout(ctx, 45*time.Second)
		resp, err := cli.Complete(ctxC, prompt, llm.Options{
			MaxTokens:   420,
			Temperature: 0.2,
			Operation:   "jonfrey_optimize_audience",
			JSONMode:    true,
		})
		cancel()
		if err != nil {
			continue
		}

		var parsed struct {
			CategoriesToAdd    []string `json:"categories_to_add"`
			CategoriesToRemove []string `json:"categories_to_remove"`
			BrandsToAdd        []string `json:"brands_to_add"`
			BrandsToRemove     []string `json:"brands_to_remove"`
			Confidence         float64  `json:"confidence"`
			Reasoning          string   `json:"reasoning"`
		}
		if err := json.Unmarshal([]byte(resp), &parsed); err != nil {
			continue
		}

		// Se confiança >= 0.85, aplicar mudanças
		if parsed.Confidence < 0.85 {
			continue
		}

		// Aplicar mudanças na audiência
		for _, c := range parsed.CategoriesToAdd {
			found := false
			for _, existing := range ch.Audience.Categories {
				if existing == c {
					found = true
					break
				}
			}
			if !found && c != "" {
				ch.Audience.Categories = append(ch.Audience.Categories, c)
			}
		}

		for _, c := range parsed.CategoriesToRemove {
			var newCats []string
			for _, existing := range ch.Audience.Categories {
				if existing != c {
					newCats = append(newCats, existing)
				}
			}
			ch.Audience.Categories = newCats
		}

		for _, b := range parsed.BrandsToAdd {
			found := false
			for _, existing := range ch.Audience.Brands {
				if existing == b {
					found = true
					break
				}
			}
			if !found && b != "" {
				ch.Audience.Brands = append(ch.Audience.Brands, b)
			}
		}

		for _, b := range parsed.BrandsToRemove {
			var newBrands []string
			for _, existing := range ch.Audience.Brands {
				if existing != b {
					newBrands = append(newBrands, existing)
				}
			}
			ch.Audience.Brands = newBrands
		}

		// Snapshot depois
		afterJSON, _ := json.Marshal(ch.Audience)

		// Atualizar no banco
		if err := ch.MarshalAudience(); err != nil {
			continue
		}
		if err := h.store.UpdateChannel(ch); err != nil {
			continue
		}

		updateCount++

		// Registrar no audit
		_, _ = h.db.ExecContext(ctx, `
			INSERT INTO jonfrey_action_audits (channel_id, action_type, before_snapshot, after_snapshot, reasoning, created_at)
			VALUES ($1, 'optimize_audience_from_clicks', $2, $3, $4, now())
		`, ch.ID, beforeJSON, afterJSON, parsed.Reasoning)
	}

	beforeMap := map[string]any{"channels_evaluated": len(channels), "with_sufficient_clicks": len(channelsWithClicks)}
	afterMap := map[string]any{"updated": updateCount, "confidence_threshold": 0.85}
	reasoning := fmt.Sprintf("Avaliei cliques dos últimos 7 dias em %d canais ativos. Otimizei audience (categorias/marcas) em %d canais com confiança LLM ≥ 85%% e ≥20 cliques.", len(channels), updateCount)
	return beforeMap, afterMap, reasoning, nil
}

// actionPurgeInactiveProducts: remove produtos marcados como inativos com 60+ dias sem update
func actionPurgeInactiveProducts(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	var before int
	_ = h.db.GetContext(ctx, &before, `SELECT COUNT(*) FROM catalogproduct WHERE inactive=true`)

	res, err := h.db.ExecContext(ctx, `
		DELETE FROM catalogproduct
		WHERE inactive=true AND updated_at < now() - interval '60 days'`)
	if err != nil {
		return nil, nil, "", err
	}
	deleted, _ := res.RowsAffected()

	var after int
	_ = h.db.GetContext(ctx, &after, `SELECT COUNT(*) FROM catalogproduct WHERE inactive=true`)

	beforeMap := map[string]any{"inactive_products_before": before}
	afterMap := map[string]any{"purged": deleted, "inactive_products_after": after}
	reasoning := fmt.Sprintf("Removi %d produtos inativos com mais de 60 dias sem atualização.", deleted)
	return beforeMap, afterMap, reasoning, nil
}

// actionPauseDeadCrawlers: pausa searchterms ativos sem resultados há 14+ dias (5+ logs com result_count=0)
func actionPauseDeadCrawlers(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	type searchTermRow struct {
		ID   int64  `db:"id"`
		Term string `db:"search_term"`
	}

	// Encontrar searchterms ativos sem novos resultados há 14d e com 5+ logs zerados
	var deadTerms []searchTermRow
	err := h.db.SelectContext(ctx, &deadTerms, `
		SELECT s.id, s.search_term
		FROM searchterm s
		WHERE s.active = true
		  AND (
		      SELECT MAX(cl.created_at) FROM crawllog cl
		      WHERE cl.searchterm_id = s.id
		  ) < now() - interval '14 days'
		  AND (
		      SELECT COUNT(*) FROM crawllog cl
		      WHERE cl.searchterm_id = s.id
		        AND cl.result_count = 0
		        AND cl.created_at > now() - interval '30 days'
		  ) >= 5`)
	if err != nil {
		return nil, nil, "", err
	}

	paused := 0
	var pausedIDs []int64
	for _, t := range deadTerms {
		res, err := h.db.ExecContext(ctx, `UPDATE searchterm SET active = false WHERE id = $1`, t.ID)
		if err == nil {
			if n, _ := res.RowsAffected(); n > 0 {
				paused++
				pausedIDs = append(pausedIDs, t.ID)
			}
		}
	}

	beforeMap := map[string]any{"dead_candidates": len(deadTerms)}
	afterMap := map[string]any{"paused": paused, "paused_ids": pausedIDs}
	reasoning := fmt.Sprintf("Identifiquei %d searchterms ativos sem resultados há 14+ dias e com 5+ tentativas falhadas — pausei %d para revisão manual.", len(deadTerms), paused)
	return beforeMap, afterMap, reasoning, nil
}

// actionEnrichTaxonomyFromUnmatched: audita próximos 100 produtos sem categoria primária
// Agrupa por similaridade de título; pede LLM JSON com sugestões; aplica se confiança ≥0.85
func actionEnrichTaxonomyFromUnmatched(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	// Passo 1: SELECT 100 produtos sem role='primary_category'
	type productRow struct {
		ID    int64  `db:"id"`
		Title string `db:"canonical_name"`
	}
	var products []productRow
	err := h.db.SelectContext(ctx, &products, `
		SELECT id, canonical_name
		FROM catalogproduct
		WHERE id NOT IN (SELECT product_id FROM catalogproduct_taxonomy WHERE role='primary_category')
		ORDER BY id DESC
		LIMIT 100
	`)
	if err != nil {
		return nil, nil, "", err
	}

	beforeMap := map[string]any{"unmatched_count": len(products)}
	if len(products) == 0 {
		return beforeMap, map[string]any{"created_taxonomies": 0, "created_patterns": 0}, "Nenhum produto sem categoria primária.", nil
	}

	// Passo 2: Agrupar por primeiras 2 palavras
	groups := make(map[string][]string)
	for _, p := range products {
		parts := strings.Fields(strings.ToLower(p.Title))
		n := 2
		if len(parts) < 2 {
			n = len(parts)
		}
		key := strings.Join(parts[:n], " ")
		groups[key] = append(groups[key], p.Title)
	}

	createdTaxonomies := 0
	createdPatterns := 0
	var reasons []string

	// Passo 3-5: Para cada grupo, chamar LLM e aplicar se confidence ≥ 0.85
	for groupKey, titles := range groups {
		// Limita a 20 títulos por chamada LLM
		batch := titles
		if len(batch) > 20 {
			batch = batch[:20]
		}

		titleList := strings.Join(batch, "\n• ")
		prompt := fmt.Sprintf(`Produtos sem categoria primária. Agrupe títulos semelhantes em categorias úteis.

TÍTULOS:
• %s

JSON apenas:
{"groups":[{"category_name":"","parent_slug":"","confidence":0.0,"sample_patterns":[{"kind":"word_boundary","value":""}]}]}`, titleList)

		ctxLLM, cancel := context.WithTimeout(ctx, 90*time.Second)
		resp, err := cli.Complete(ctxLLM, prompt, llm.Options{
			MaxTokens:   450,
			Temperature: 0.25,
			Operation:   "jonfrey_enrich_taxonomy",
			JSONMode:    true,
		})
		cancel()

		if err != nil {
			reasons = append(reasons, fmt.Sprintf("grupo '%s': LLM erro — %v", groupKey, err))
			continue
		}

		var result struct {
			Groups []struct {
				CategoryName string  `json:"category_name"`
				ParentSlug   string  `json:"parent_slug"`
				Confidence   float64 `json:"confidence"`
				Patterns     []struct {
					Kind  string `json:"kind"`
					Value string `json:"value"`
				} `json:"sample_patterns"`
			} `json:"groups"`
		}

		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			reasons = append(reasons, fmt.Sprintf("grupo '%s': parse error", groupKey))
			continue
		}

		for _, gr := range result.Groups {
			if gr.Confidence < 0.85 {
				continue
			}

			// Cria ou encontra a categoria-pai
			var parentID *int64
			if gr.ParentSlug != "" {
				var pid int64
				err := h.db.GetContext(ctx, &pid, `
					SELECT id FROM taxonomy WHERE slug = $1 LIMIT 1
				`, gr.ParentSlug)
				if err == nil {
					parentID = &pid
				}
			}

			// Cria a nova taxonomy
			var taxID int64
			slug := strings.ToLower(strings.ReplaceAll(gr.CategoryName, " ", "-"))
			err := h.db.GetContext(ctx, &taxID, `
				INSERT INTO taxonomy(type, name, slug, parent_id, source, status)
				VALUES('category', $1, $2, $3, 'jonfrey', 'approved')
				ON CONFLICT (slug) DO UPDATE SET updated_at = now() RETURNING id
			`, gr.CategoryName, slug, parentID)

			if err == nil {
				createdTaxonomies++

				// Cria patterns associados
				for _, p := range gr.Patterns {
					_, _ = h.db.ExecContext(ctx, `
						INSERT INTO taxonomy_pattern(taxonomy_id, kind, value, weight, source, active)
						VALUES($1, $2, $3, 1.0, 'jonfrey', true)
						ON CONFLICT DO NOTHING
					`, taxID, p.Kind, p.Value)
					createdPatterns++
				}

				reasons = append(reasons, fmt.Sprintf("categoria '%s' criada com confidence %.2f", gr.CategoryName, gr.Confidence))
			}
		}
	}

	afterMap := map[string]any{"created_taxonomies": createdTaxonomies, "created_patterns": createdPatterns}
	reasoning := fmt.Sprintf("Analisei %d produtos sem categoria. Criei %d novas taxonomias e %d patterns com confidence ≥ 0.85.",
		len(products), createdTaxonomies, createdPatterns)

	return beforeMap, afterMap, reasoning, nil
}

// actionPruneFalsePositives: top 20 taxonomias com false_positive flags
// Para cada taxonomy_id, LLM sugere exclude_regex patterns
func actionPruneFalsePositives(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	// Passo 1: Top 20 taxonomias com false_positive
	type topTaxRow struct {
		TaxonomyID int64 `db:"taxonomy_id"`
		Count      int64 `db:"count"`
	}
	var topTaxonomies []topTaxRow
	err := h.db.SelectContext(ctx, &topTaxonomies, `
		SELECT cpt.taxonomy_id, COUNT(*) AS count
		FROM auto_match_logs aml
		JOIN catalogproduct_taxonomy cpt ON cpt.product_id = aml.product_id
		WHERE aml.false_positive = true AND aml.created_at > now() - interval '30 days'
		GROUP BY cpt.taxonomy_id
		ORDER BY count DESC
		LIMIT 20
	`)
	if err != nil {
		return nil, nil, "", err
	}

	beforeMap := map[string]any{"fp_count": 0}
	if len(topTaxonomies) == 0 {
		return beforeMap, map[string]any{"suggestions_created": 0}, "Nenhum false positive nos últimos 30 dias.", nil
	}

	// Contar total de FP
	var totalFP int64
	_ = h.db.GetContext(ctx, &totalFP, `
		SELECT COUNT(*) FROM auto_match_logs
		WHERE false_positive = true AND created_at > now() - interval '30 days'
	`)
	beforeMap["fp_count"] = totalFP

	suggestionsCreated := 0

	// Passo 2-4: Para cada taxonomy, pegar 50 títulos com false_positive e pedir LLM
	for _, tt := range topTaxonomies {
		type productTitle struct {
			Title string `db:"title"`
		}
		var titles []productTitle
		err := h.db.SelectContext(ctx, &titles, `
			SELECT DISTINCT cp.canonical_name AS title
			FROM auto_match_logs aml
			JOIN catalogproduct_taxonomy cpt ON cpt.product_id = aml.product_id
			JOIN catalogproduct cp ON cp.id = aml.product_id
			WHERE cpt.taxonomy_id = $1
			  AND aml.false_positive = true
			  AND aml.created_at > now() - interval '30 days'
			LIMIT 28
		`, tt.TaxonomyID)
		if err != nil || len(titles) == 0 {
			continue
		}

		// Get taxonomy name
		var taxName string
		_ = h.db.GetContext(ctx, &taxName, `
			SELECT name FROM taxonomy WHERE id = $1
		`, tt.TaxonomyID)

		titleList := ""
		for i, t := range titles {
			if i > 0 {
				titleList += "\n• "
			} else {
				titleList = "• "
			}
			titleList += t.Title
		}

		prompt := fmt.Sprintf(`Taxonomia "%s" com falsos positivos (títulos reais):

%s

Exclude regex Postgres-safe (preferir \\m palavra \\M ou \\b curtos). Um pattern por tema.

JSON:
{"exclude_patterns":[{"pattern":"","reasoning":""}]}`, taxName, titleList)

		ctxLLM, cancel := context.WithTimeout(ctx, 90*time.Second)
		resp, err := cli.Complete(ctxLLM, prompt, llm.Options{
			MaxTokens:   320,
			Temperature: 0.15,
			Operation:   "jonfrey_prune_fp",
			JSONMode:    true,
		})
		cancel()

		if err != nil {
			continue
		}

		var result struct {
			ExcludePatterns []struct {
				Pattern   string `json:"pattern"`
				Reasoning string `json:"reasoning"`
			} `json:"exclude_patterns"`
		}

		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			continue
		}

		for _, ep := range result.ExcludePatterns {
			_, _ = h.db.ExecContext(ctx, `
				INSERT INTO taxonomy_pattern(taxonomy_id, kind, value, weight, source, active)
				VALUES($1, 'exclude_regex', $2, 1.0, 'jonfrey', false)
				ON CONFLICT DO NOTHING
			`, tt.TaxonomyID, ep.Pattern)
			suggestionsCreated++
		}
	}

	afterMap := map[string]any{"suggestions_created": suggestionsCreated}
	reasoning := fmt.Sprintf("Detectei %d false positives nos últimos 30d em %d taxonomias. Criei %d sugestões de exclude_regex (pendentes aprovação).",
		totalFP, len(topTaxonomies), suggestionsCreated)

	return beforeMap, afterMap, reasoning, nil
}

// actionRefineSubcategories: para cada categoria-raiz com >100 produtos sem subcategory
// LLM agrupa amostras (50) em 3-7 subcategorias
func actionRefineSubcategories(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	// Passo 1: Categorias-raiz
	type rootCat struct {
		ID   int64  `db:"id"`
		Name string `db:"name"`
		Slug string `db:"slug"`
	}
	var rootCats []rootCat
	err := h.db.SelectContext(ctx, &rootCats, `
		SELECT id, name, slug FROM taxonomy
		WHERE type = 'category' AND parent_id IS NULL
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, nil, "", err
	}

	beforeMap := map[string]any{"candidate_categories": 0}
	if len(rootCats) == 0 {
		return beforeMap, map[string]any{"subcategories_created": 0, "patterns_created": 0}, "Nenhuma categoria-raiz encontrada.", nil
	}

	subCatsCreated := 0
	patternsCreated := 0
	candidateCount := 0

	// Passo 2-5: Para cada raiz, contar produtos sem subcategoria
	for _, rc := range rootCats {
		// Contar produtos da categoria SEM subcategoria
		var countNoSubcat int64
		err := h.db.GetContext(ctx, &countNoSubcat, `
			SELECT COUNT(DISTINCT cpt.product_id)
			FROM catalogproduct_taxonomy cpt
			WHERE cpt.taxonomy_id = $1
			  AND cpt.role = 'primary_category'
			  AND cpt.product_id NOT IN (
				  SELECT product_id FROM catalogproduct_taxonomy WHERE role = 'subcategory'
			  )
		`, rc.ID)

		if err != nil || countNoSubcat <= 100 {
			continue
		}

		candidateCount++

		// Pega 50 amostras de títulos
		type prodTitle struct {
			Title string `db:"title"`
		}
		var titles []prodTitle
		err = h.db.SelectContext(ctx, &titles, `
			SELECT DISTINCT cp.canonical_name AS title
			FROM catalogproduct_taxonomy cpt
			JOIN catalogproduct cp ON cp.id = cpt.product_id
			WHERE cpt.taxonomy_id = $1
			  AND cpt.role = 'primary_category'
			  AND cpt.product_id NOT IN (
				  SELECT product_id FROM catalogproduct_taxonomy WHERE role = 'subcategory'
			  )
			ORDER BY RANDOM()
			LIMIT 50
		`, rc.ID)

		if err != nil || len(titles) == 0 {
			continue
		}

		titleList := ""
		for i, t := range titles {
			if i > 0 {
				titleList += "\n• "
			} else {
				titleList = "• "
			}
			titleList += t.Title
		}

		prompt := fmt.Sprintf(`Raiz "%s": %d produtos sem subcategoria. Agrupe só estes exemplos em 3-7 subcategorias úteis.

%s

JSON:
{"subcategories":[{"name":"","slug":"","confidence":0.0,"patterns":[{"kind":"word_boundary","value":""}]}]}`, rc.Name, countNoSubcat, titleList)

		ctxLLM, cancel := context.WithTimeout(ctx, 90*time.Second)
		resp, err := cli.Complete(ctxLLM, prompt, llm.Options{
			MaxTokens:   520,
			Temperature: 0.25,
			Operation:   "jonfrey_refine_subcats",
			JSONMode:    true,
		})
		cancel()

		if err != nil {
			continue
		}

		var result struct {
			Subcategories []struct {
				Name       string  `json:"name"`
				Slug       string  `json:"slug"`
				Confidence float64 `json:"confidence"`
				Patterns   []struct {
					Kind  string `json:"kind"`
					Value string `json:"value"`
				} `json:"patterns"`
			} `json:"subcategories"`
		}

		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			continue
		}

		for _, sub := range result.Subcategories {
			if sub.Confidence < 0.85 {
				continue
			}

			// Cria a subcategoria com parent_id = rc.ID
			var subID int64
			err := h.db.GetContext(ctx, &subID, `
				INSERT INTO taxonomy(type, name, slug, parent_id, source, status)
				VALUES('category', $1, $2, $3, 'jonfrey', 'approved')
				ON CONFLICT (slug) DO UPDATE SET updated_at = now() RETURNING id
			`, sub.Name, sub.Slug, rc.ID)

			if err == nil {
				subCatsCreated++

				// Cria patterns
				for _, p := range sub.Patterns {
					_, _ = h.db.ExecContext(ctx, `
						INSERT INTO taxonomy_pattern(taxonomy_id, kind, value, weight, source, active)
						VALUES($1, $2, $3, 1.0, 'jonfrey', true)
						ON CONFLICT DO NOTHING
					`, subID, p.Kind, p.Value)
					patternsCreated++
				}
			}
		}
	}

	beforeMap["candidate_categories"] = candidateCount
	afterMap := map[string]any{"subcategories_created": subCatsCreated, "patterns_created": patternsCreated}
	reasoning := fmt.Sprintf("Encontrei %d categorias-raiz com >100 produtos sem subcategoria. Criei %d subcategorias e %d patterns com LLM.",
		candidateCount, subCatsCreated, patternsCreated)

	return beforeMap, afterMap, reasoning, nil
}

// capJonfreyKeywords trunca lista de keywords p/ prompts (economia de tokens).
func capJonfreyKeywords(src []string, maxN, maxRuneLen int) []string {
	out := make([]string, 0, maxN)
	for _, s := range src {
		if len(out) >= maxN {
			break
		}
		t := strings.TrimSpace(s)
		if t == "" {
			continue
		}
		runes := []rune(t)
		if maxRuneLen > 0 && len(runes) > maxRuneLen {
			t = string(runes[:maxRuneLen]) + "…"
		}
		out = append(out, t)
	}
	return out
}

