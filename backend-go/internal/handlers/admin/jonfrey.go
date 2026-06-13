package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"snatcher/backendv2/internal/services/jobs"
	"snatcher/backendv2/internal/services/jonfrey_regulator"
	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/notifier"
	store "snatcher/backendv2/internal/repositories"
)

// JonfreyHandler é o orquestrador AI das automações.
type JonfreyHandler struct {
	store    store.Store
	db       *sqlx.DB
	llmFn    func() llm.Client
	notif    *notifier.Notifier // pode ser nil — métodos checam internamente

	// Ciclo agendado (scheduler): um batch por vez — evita dois RunCycle sobrepostos e LastRunAt incorreto.
	schedCycleMu   sync.Mutex
	schedCycleBusy bool

	// Cache da revisão Jonfrey · 24h (GET /api/jonfrey/review-dispatches).
	// TTL 24h — janela é exatamente 24h, então re-rodar antes só faria o
	// usuário pagar LLM de novo cobrindo quase os mesmos dispatches.
	// Cache em memória (hit rápido) + persistido em jonfrey_review_cache
	// (sobrevive a restart do backend). Bypass manual via ?force=1 no GET.
	reviewMu       sync.Mutex
	reviewCachedAt time.Time
}

// flexMergeID decodifica merge_id do LLM como número JSON ou string ("123").
func flexMergeID(raw json.RawMessage) int64 {
	if len(raw) == 0 {
		return 0
	}
	var n int64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
		return n
	}
	return 0
}

const (
	jonfreyActionHardTimeout = 22 * time.Minute // teto por ação dentro de executeAction
	jonfreyLLMOuterBudget    = 20 * time.Minute // ações que fazem muitas chamadas LLM em loop
	// jonfreyStaleRunningMin deve ser > jonfreyActionHardTimeout + folga (várias réplicas / pg lento).
	// Antes em 35m ainda havia corrida com batch de 50m ou mutex global bloqueando ações "running" >35m.
	jonfreyStaleRunningMin = 58
)

// jonfreyQueueJobKey associa executeAction ao job da fila universal (activity log).
type jonfreyQueueJobKey struct{}

func ctxWithJonfreyJobID(ctx context.Context, jobID string) context.Context {
	return context.WithValue(ctx, jonfreyQueueJobKey{}, jobID)
}

func jonfreyJobIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(jonfreyQueueJobKey{}).(string)
	return v
}

func NewJonfreyHandler(st store.Store, db *sqlx.DB) *JonfreyHandler {
	return &JonfreyHandler{store: st, db: db}
}

func (h *JonfreyHandler) SetLLMFn(fn func() llm.Client)              { h.llmFn = fn }
func (h *JonfreyHandler) SetNotifier(n *notifier.Notifier)           { h.notif = n }

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
	"drain_llm_queue": {
		Type:        "drain_llm_queue",
		Category:    "curation",
		Description: "Drena catalog_llm_queue processando até 10 itens por ciclo via LLM (brand+category). Substitui o scheduler cron quando catalogLLMFactory não está registrada.",
		UsesLLM:     true,
		Run:         actionDrainLLMQueue,
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
		Description: "Com full_auto_mode ON, passa pending_approval → queued (dispatch worker envia). Roda no auto-pilot. Sinónimo legado na lista/API: enable_full_auto.",
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
	"channel_category_sync": {
		Type:        "channel_category_sync",
		Category:    "curation",
		Description: "Analisa canais sem categoria dedicada → cria categoria com keywords heurísticas → re-classifica produtos da base que estão em 'Geral' ou sem categoria. Zero LLM, zero custo.",
		UsesLLM:     false,
		Run:         actionChannelCategorySync,
	},
	"catalog_brand_classification": {
		Type:        "catalog_brand_classification",
		Category:    "curation",
		Description: "Classifica brand de produtos sem marca usando brand_keywords do banco. Zero LLM, zero custo.",
		UsesLLM:     false,
		Run:         actionCatalogBrandClassification,
	},
	"tune_bandit_exploration": {
		Type:        "tune_bandit_exploration",
		Category:    "optimization",
		Description: "Chama o regulator de bandit para cada canal ativo; ajusta exploration_factor se canal está estagnado ou com CTR em queda. Usa jonfrey_regulator.RegulateChannelBandit (W5).",
		UsesLLM:     false,
		Run:         actionTuneBanditExploration,
	},
}

// jonfreyActionAliases mapeia tipos legados → canónico no actionRegistry (sem duplicar Run na UI).
var jonfreyActionAliases = map[string]string{
	"enable_full_auto": "auto_release_pending",
}

func resolveJonfreyActionType(t string) string {
	t = strings.TrimSpace(t)
	if t == "" {
		return ""
	}
	if c, ok := jonfreyActionAliases[t]; ok {
		return c
	}
	return t
}

// normalizeJonfreyEnabledActions resolve aliases e remove duplicados mantendo a primeira ocorrência.
func normalizeJonfreyEnabledActions(actions []string) []string {
	seen := make(map[string]bool)
	out := make([]string, 0, len(actions))
	for _, raw := range actions {
		c := resolveJonfreyActionType(raw)
		if c == "" {
			continue
		}
		if seen[c] {
			continue
		}
		seen[c] = true
		out = append(out, c)
	}
	return out
}

// ── Ações ──────────────────────────────────────────────────────────────────

// actionDrainLLMQueue drena catalog_llm_queue via LLM — substitui o scheduler cron quando
// catalogLLMFactory não está registrada. Roda a cada ciclo do Jonfrey (1min).
func actionDrainLLMQueue(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado (h.llmFn nil)")
	}
	factory := h.llmFn
	if factory() == nil {
		return nil, nil, "", fmt.Errorf("LLM factory retornou nil — verificar Settings → LLM")
	}

	const batchSize = 10
	processed, errors, heuristic := 0, 0, 0
	for i := 0; i < batchSize; i++ {
		out, err := jobs.RunCatalogLLMQueueOnce(ctx, h.db, factory)
		if err != nil {
			errors++
			break
		}
		if proc, _ := out["processed"].(bool); !proc {
			// Fila vazia ou item sem progresso — parar cedo
			break
		}
		mode, _ := out["mode"].(string)
		if mode == "heuristic" {
			heuristic++
		} else {
			processed++
		}
	}

	summary := fmt.Sprintf("Processados: %d LLM + %d heurística, %d erros", processed, heuristic, errors)
	before := map[string]any{"batch_size": batchSize}
	after := map[string]any{"processed_llm": processed, "processed_heuristic": heuristic, "errors": errors}
	return before, after, summary, nil
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

	// Curation handler v1 removido — inspeção via L4/loops (v2). Stub: reporta pending sem disparar.
	return map[string]any{"pending": pendingCount},
		map[string]any{"started": false, "reason": "curation v1 removed — use L4 dashboard"},
		fmt.Sprintf("Curation handler v1 foi removido (unify-v1-v2). %d produtos pendentes — auditoria agora via /admin/loops e /suggestions-l4.", pendingCount),
		nil
}

func actionTuneThresholds(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}

	// ListChannelAutomations removido em v2 — action desativada
	_ = cli
	beforeMap := map[string]any{"automations_count": 0}
	afterMap := map[string]any{"adjusted_count": 0}
	return beforeMap, afterMap, "tune_thresholds desativado (ChannelAutomation removido em v2)", nil
}

// ── Handlers HTTP ──────────────────────────────────────────────────────────

// ListActions GET /api/jonfrey/actions
func (h *JonfreyHandler) ListActions(w http.ResponseWriter, r *http.Request) {
	h.reconcileStaleJonfreyActions()

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
	lastBy, _ := h.store.JonfreyLastRunByActionType()
	if lastBy == nil {
		lastBy = map[string]models.JonfreyLastRunSummary{}
	}
	type item struct {
		Type            string     `json:"type"`
		Category        string     `json:"category"`
		Description     string     `json:"description"`
		UsesLLM         bool       `json:"uses_llm"`
		LastRunAt       *time.Time `json:"last_run_at,omitempty"`
		LastRunStatus   string     `json:"last_run_status,omitempty"`
	}
	out := []item{}
	for _, a := range actionRegistry {
		it := item{Type: a.Type, Category: a.Category, Description: a.Description, UsesLLM: a.UsesLLM}
		if info, ok := lastBy[a.Type]; ok {
			tCopy := info.FinishedAt
			it.LastRunAt = &tCopy
			it.LastRunStatus = info.Status
		}
		out = append(out, it)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Type < out[j].Type })
	writeJSON(w, http.StatusOK, out)
}

// RunCycle executa actions do Jonfrey ordenadas por categoria.
// Ordem: cleanup → curation → health → optimization → dispatch
//
// dbAutomationIDs: lista de action-IDs vindos do scheduler (DB-driven, com intervalo vencido).
// Se vazio (fallback), usa cfg.EnabledActions da JonfreyConfig global.
// Despacha em background com um único job na fila universal.
func (h *JonfreyHandler) RunCycle(ctx context.Context, dbAutomationIDs []string) {
	_ = ctx // tick vem do scheduler; o batch usa context.Background + job próprio
	cfg, err := h.store.GetJonfreyConfig()
	if err != nil {
		slog.Warn("jonfrey RunCycle abortado — GetJonfreyConfig", "err", err)
		return
	}
	if !cfg.Enabled {
		slog.Info("jonfrey RunCycle ignorado — cfg.Enabled=false")
		return
	}

	order := []string{"cleanup", "curation", "health", "optimization", "dispatch"}

	// Resolve a lista de actions a executar: DB-driven se não-vazio, senão cfg fallback.
	var sourceActions []string
	if len(dbAutomationIDs) > 0 {
		sourceActions = dbAutomationIDs
		slog.Info("jonfrey RunCycle usando lista DB-driven",
			"db_automation_ids", dbAutomationIDs,
		)
	} else {
		sourceActions = []string(cfg.EnabledActions)
		slog.Info("jonfrey RunCycle usando cfg.EnabledActions (fallback)",
			"enabled_actions", sourceActions,
		)
	}

	enabledCanon := normalizeJonfreyEnabledActions(sourceActions)
	var typesToRun []string
	var skippedUnknown []string
	for _, raw := range sourceActions {
		t := resolveJonfreyActionType(raw)
		if _, ok := actionRegistry[t]; !ok {
			skippedUnknown = append(skippedUnknown, raw)
		}
	}
	for _, cat := range order {
		for _, t := range enabledCanon {
			def, ok := actionRegistry[t]
			if !ok || def.Category != cat {
				continue
			}
			typesToRun = append(typesToRun, t)
		}
	}
	if len(typesToRun) == 0 {
		slog.Info("jonfrey RunCycle sem ações a executar",
			"source_actions", sourceActions,
			"skipped_unknown_types", skippedUnknown,
			"hint", "tipos devem existir no registry e bater categoria cleanup|curation|health|optimization|dispatch; para liberar dispatches com full-auto ON use auto_release_pending (sinónimo legado: enable_full_auto)",
		)
		return
	}

	h.schedCycleMu.Lock()
	if h.schedCycleBusy {
		h.schedCycleMu.Unlock()
		slog.Info("jonfrey RunCycle ignorado — batch agendado já em execução (manual ou ciclo anterior)")
		return
	}
	h.schedCycleBusy = true
	h.schedCycleMu.Unlock()

	hasDispatch := false
	for _, t := range typesToRun {
		if d, ok := actionRegistry[t]; ok && d.Category == "dispatch" {
			hasDispatch = true
			break
		}
	}
	slog.Info("jonfrey RunCycle enfileirando batch",
		"actions_count", len(typesToRun),
		"actions", typesToRun,
		"includes_dispatch_actions", hasDispatch,
	)

	jm := jobs.Default()
	job, jobCtx := jm.StartKind(context.Background(), "jonfrey", fmt.Sprintf("Jonfrey agendado ×%d", len(typesToRun)))
	go func() {
		defer func() {
			cfg2, err := h.store.GetJonfreyConfig()
			if err == nil {
				now := time.Now()
				cfg2.LastRunAt = models.NullTime{NullTime: sql.NullTime{Time: now, Valid: true}}
				if err := h.store.UpdateJonfreyConfig(cfg2); err != nil {
					slog.Warn("jonfrey RunCycle post-batch UpdateJonfreyConfig", "err", err)
				} else {
					slog.Info("jonfrey RunCycle: LastRunAt atualizado",
						"job_id", job.ID,
						"last_run_at", now.UTC().Format(time.RFC3339),
						"interval_minutes", cfg2.IntervalMinutes,
					)
				}
			} else {
				slog.Warn("jonfrey RunCycle post-batch GetJonfreyConfig", "err", err)
			}
			h.schedCycleMu.Lock()
			h.schedCycleBusy = false
			h.schedCycleMu.Unlock()
		}()
		h.runJonfreyBatch(jobCtx, job.ID, "scheduled", "", typesToRun)
	}()
}

// RunAction POST /api/jonfrey/run
// Body: { "action_type": "...", "target": "..." }
// Se action_type vazio → executa todas as ações habilitadas na config.
// Sempre enfileira em background + job na fila universal (ver GET /api/work-queue).
func (h *JonfreyHandler) RunAction(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ActionType string `json:"action_type"`
		Target     string `json:"target"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	var typesToRun []string
	if req.ActionType != "" {
		typesToRun = []string{resolveJonfreyActionType(req.ActionType)}
	} else {
		cfg, _ := h.store.GetJonfreyConfig()
		typesToRun = normalizeJonfreyEnabledActions([]string(cfg.EnabledActions))
	}

	jm := jobs.Default()
	jobName := fmt.Sprintf("Jonfrey×%d", len(typesToRun))
	if len(typesToRun) == 1 {
		jobName = "Jonfrey:" + typesToRun[0]
	}
	job, jobCtx := jm.StartKind(context.Background(), "jonfrey", jobName)
	go h.runJonfreyBatch(jobCtx, job.ID, "manual", req.Target, typesToRun)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"queued":     true,
		"job_id":     job.ID,
		"batch":      len(typesToRun) > 1,
		"count":      len(typesToRun),
		"action_ids": []int64{},
		"message":    "Em fila — acompanhe actividade em Tempo real → Fila de trabalhos ou GET /api/work-queue",
	})
}

func truncJonfreyStr(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func (h *JonfreyHandler) reconcileStaleJonfreyActions() {
	msg := "encerrado como falha: execução não finalizou a tempo ou o servidor reiniciou (running antigo)."
	n, err := h.store.ReconcileStaleJonfreyActions(jonfreyStaleRunningMin, msg)
	if err != nil {
		slog.Warn("jonfrey reconcile stale running", "err", err)
		return
	}
	if n > 0 {
		slog.Info("jonfrey reconciled stale running rows", "rows", n)
	}
}

// runJonfreyBatch executa várias definições em sequência num goroutine (ver RunAction).
func (h *JonfreyHandler) runJonfreyBatch(parentCtx context.Context, jobID, triggeredBy, target string, typesToRun []string) {
	jm := jobs.Default()
	defer func() {
		if r := recover(); r != nil {
			jm.Fail(jobID, fmt.Sprintf("panic no batch: %v", r))
			slog.Error("jonfrey batch panic", "job", jobID, "panic", r)
		}
	}()

	runCtx, cancel := context.WithTimeout(ctxWithJonfreyJobID(parentCtx, jobID), 50*time.Minute)
	defer cancel()

	total := len(typesToRun)
	done := 0
	var ids []int64

	slog.Info("jonfrey runJonfreyBatch início",
		"job_id", jobID,
		"triggered_by", triggeredBy,
		"total", total,
		"types", typesToRun,
	)

	// Notificação imediata: batch manual é async — operador vê o job_id no grupo configurado.
	if h.notif != nil && total > 0 && triggeredBy == "manual" {
		origem := "painel / API"
		if strings.TrimSpace(target) != "" {
			origem = fmt.Sprintf("manual · target=%s", strings.TrimSpace(target))
		}
		list := strings.Join(typesToRun, ", ")
		if len(list) > 700 {
			list = list[:700] + "…"
		}
		body := fmt.Sprintf("Job na fila universal\nid: %s\n%d ação(ões)\n%s\n\n%s", jobID, total, origem, list)
		h.notif.Notify(notifier.KindJonfreyJobQueued, body, "", 0)
	}

	jm.AppendActivity(jobID, fmt.Sprintf("fila: %d ação(ões) · ordem FIFO", total))

	for _, raw := range typesToRun {
		t := resolveJonfreyActionType(raw)
		def, ok := actionRegistry[t]
		if !ok {
			jm.AppendActivity(jobID, fmt.Sprintf("tipo desconhecido ignorado: %s", raw))
			jm.Update(jobID, done, total, fmt.Sprintf("ignorado: %s", t))
			done++
			continue
		}
		jm.AppendActivity(jobID, fmt.Sprintf("▶ início %s", def.Type))
		jm.Update(jobID, done, total, fmt.Sprintf("a correr %s…", def.Type))
		id := h.executeAction(runCtx, def, triggeredBy, target)
		slog.Info("jonfrey batch passo concluído",
			"job_id", jobID,
			"triggered_by", triggeredBy,
			"step", done+1,
			"of", total,
			"action_type", def.Type,
			"audit_id", id,
		)
		if id > 0 {
			ids = append(ids, id)
		}
		done++
		jm.AppendActivity(jobID, fmt.Sprintf("■ fim %s · audit #%d", def.Type, id))
		jm.Update(jobID, done, total, fmt.Sprintf("%s terminou (audit #%d)", def.Type, id))
	}

	jm.Done(jobID, fmt.Sprintf("Jonfrey: %d/%d ações concluídas (audit ids=%v).", len(ids), total, ids))
	slog.Info("jonfrey runJonfreyBatch fim",
		"job_id", jobID,
		"triggered_by", triggeredBy,
		"audit_ids", ids,
		"completed_steps", done,
		"total", total,
	)
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
		slog.Warn("jonfrey CreateJonfreyAction failed", "type", def.Type, "err", err)
		return 0
	}
	action.ID = id

	queueJob := jonfreyJobIDFromCtx(ctx)
	slog.Info("jonfrey executeAction início",
		"audit_id", id,
		"action_type", def.Type,
		"category", def.Category,
		"triggered_by", triggeredBy,
		"parent_job_id", queueJob,
	)
	if queueJob != "" {
		jobs.Default().AppendActivity(queueJob, fmt.Sprintf("audit #%d · %s · estado running", id, def.Type))
	}

	actionCtx, cancel := context.WithTimeout(ctx, jonfreyActionHardTimeout)
	defer cancel()

	defer func() {
		r := recover()
		if r == nil {
			return
		}
		now := time.Now()
		action.Status = "failed"
		action.FinishedAt = models.NullTime{NullTime: sql.NullTime{Time: now, Valid: true}}
		action.ErrorMessage = models.NullString{NullString: sql.NullString{
			String: truncJonfreyStr(fmt.Sprintf("panic: %v", r), 8000),
			Valid:  true,
		}}
		if updErr := h.store.UpdateJonfreyAction(action); updErr != nil {
			slog.Error("jonfrey UpdateJonfreyAction after panic", "id", action.ID, "type", def.Type, "err", updErr)
		}
		if queueJob != "" {
			jobs.Default().AppendActivity(queueJob, fmt.Sprintf("audit #%d · panic: %v", action.ID, r))
		}
		slog.Error("jonfrey action panic", "type", def.Type, "id", action.ID, "panic", r)
	}()

	if queueJob != "" {
		jobs.Default().AppendActivity(queueJob, fmt.Sprintf("executando motor LLM/SQL · %s (#%d)", def.Type, id))
	}

	before, after, reasoning, runErr := def.Run(actionCtx, h)
	action.FinishedAt = models.NullTime{NullTime: sql.NullTime{Time: time.Now(), Valid: true}}

	// Graceful skip para ações legadas que referenciam tabelas v1 removidas (42P01).
	// Usa errors.As para desempacotar erros wrappados com fmt.Errorf("...: %w", pgErr).
	if runErr != nil {
		var pgErr *pq.Error
		if errors.As(runErr, &pgErr) && string(pgErr.Code) == "42P01" {
			slog.Info("jonfrey: tabela v1 ausente — ação ignorada",
				"action", def.Type, "table", pgErr.Table)
			runErr = nil
			action.Status = "success"
			reasoning = fmt.Sprintf("Ação ignorada — tabela '%s' foi removida na migração v2. Sem efeito.", pgErr.Table)
			before = map[string]any{"legacy_table": pgErr.Table}
			after = map[string]any{"skipped": true}
		}
	}
	if runErr != nil {
		action.Status = "failed"
		action.ErrorMessage = models.NullString{NullString: sql.NullString{
			String: truncJonfreyStr(runErr.Error(), 8000),
			Valid:  true,
		}}
	} else {
		action.Status = "success"
	}
	if reasoning != "" {
		action.Reasoning = models.NullString{NullString: sql.NullString{
			String: truncJonfreyStr(reasoning, 12000),
			Valid:  true,
		}}
	}
	if before != nil {
		raw, err := json.Marshal(before)
		if err != nil {
			slog.Warn("jonfrey json.Marshal(before) failed", "type", def.Type, "audit_id", action.ID, "err", err)
			action.BeforeSnapshot = []byte("{}")
		} else {
			action.BeforeSnapshot = raw
		}
	}
	if after != nil {
		raw, err := json.Marshal(after)
		if err != nil {
			slog.Warn("jonfrey json.Marshal(after) failed", "type", def.Type, "audit_id", action.ID, "err", err)
			action.AfterSnapshot = []byte("{}")
		} else {
			action.AfterSnapshot = raw
		}
	}
	if updErr := h.store.UpdateJonfreyAction(action); updErr != nil {
		slog.Error("jonfrey UpdateJonfreyAction failed", "id", action.ID, "type", def.Type, "err", updErr)
	} else {
		args := []any{
			"audit_id", action.ID,
			"action_type", def.Type,
			"category", def.Category,
			"status", action.Status,
			"triggered_by", triggeredBy,
			"parent_job_id", queueJob,
		}
		if runErr != nil {
			args = append(args, "err", runErr.Error())
		}
		if def.Category == "dispatch" {
			args = append(args,
				"pipeline_note", "Jonfrey só move pending_approval→queued (full-auto); envio WA/TG é o RunDispatchWorker (~15s). Audit≠mensagem entregue.",
			)
		}
		slog.Info("jonfrey executeAction fim", args...)
	}
	if queueJob != "" {
		if runErr != nil {
			msg := runErr.Error()
			if len(msg) > 280 {
				msg = msg[:280] + "…"
			}
			jobs.Default().AppendActivity(queueJob, fmt.Sprintf("audit #%d · falhou: %s", id, msg))
		} else {
			sum := reasoning
			if sum == "" {
				sum = "OK"
			}
			if len(sum) > 240 {
				sum = sum[:240] + "…"
			}
			jobs.Default().AppendActivity(queueJob, fmt.Sprintf("audit #%d · %s · %s", id, action.Status, sum))
		}
	}
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
		cfg.EnabledActions = pq.StringArray(normalizeJonfreyEnabledActions(req.EnabledActions))
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

	// ListPendingCurationProducts removido em v2 — action desativada
	_ = cli
	beforeMap := map[string]any{"pending_count": 0}
	return beforeMap, map[string]any{"approved": 0, "rejected": 0}, "autocurate desativado (ListPendingCurationProducts removido em v2)", nil
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
		  grp.channel_id AS channel_id,
		  COALESCE(c.name, '') AS channel_name,
		  COUNT(dt.id) AS total,
		  COUNT(*) FILTER (WHERE dt.status = 'delivered') AS delivered,
		  COUNT(*) FILTER (WHERE dt.status = 'failed') AS failed,
		  COALESCE(SUM(dt.click_count), 0) AS clicks
		FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		JOIN groups grp ON grp.id = dt.group_id
		LEFT JOIN channel c ON c.id = grp.channel_id
		WHERE d.created_at > now() - interval '14 days'
		  AND grp.channel_id IS NOT NULL
		GROUP BY grp.channel_id, c.name
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
		if ctx.Err() != nil {
			return nil, nil, "", ctx.Err()
		}
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
		// pausa: GetChannelAutomation removido em v2 — registra apenas
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

	// Passo 2: arquivar grupos com falhas recorrentes (um único UPDATE — evita N round-trips)
	var candidatesArchived int
	_ = h.db.GetContext(ctx, &candidatesArchived, `
		SELECT COUNT(*) FROM groups g
		WHERE g.archived = false
		  AND g.last_error_at IS NOT NULL
		  AND g.last_error_at < now() - interval '7 days'
		  AND (
		      SELECT COUNT(*) FROM dispatch_targets dt
		      JOIN dispatches d ON d.id = dt.dispatch_id
		      WHERE dt.group_id = g.id
		        AND dt.status = 'failed'
		        AND COALESCE(dt.attempted_at, d.created_at) > now() - interval '14 days'
		  ) >= 3`)

	resArch, err := h.db.ExecContext(ctx, `
		UPDATE groups g SET archived = true
		WHERE g.archived = false
		  AND g.last_error_at IS NOT NULL
		  AND g.last_error_at < now() - interval '7 days'
		  AND (
		      SELECT COUNT(*) FROM dispatch_targets dt
		      JOIN dispatches d ON d.id = dt.dispatch_id
		      WHERE dt.group_id = g.id
		        AND dt.status = 'failed'
		        AND COALESCE(dt.attempted_at, d.created_at) > now() - interval '14 days'
		  ) >= 3`)
	if err != nil {
		return nil, nil, "", err
	}
	archived, _ := resArch.RowsAffected()

	beforeMap := map[string]any{"candidates_full": candidatesFull, "candidates_archived": candidatesArchived}
	afterMap := map[string]any{"marked_full": markedFull, "archived": archived}
	reasoning := fmt.Sprintf("Encontrei %d grupos WhatsApp ativos com 1024+ membros — marquei como 'full'. Achei %d grupos com last_error_at > 7d e ≥3 falhas nos últimos 14d — arquivei %d.", candidatesFull, candidatesArchived, archived)
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
	// Passo 1: remover duplicatas — ROW_NUMBER por (product_id, channel_id), mantém só o dispatch mais recente
	resDedup, err := h.db.ExecContext(ctx, `
		WITH ranked AS (
			SELECT d.id,
			       ROW_NUMBER() OVER (
			           PARTITION BY aml.product_id, aml.channel_id
			           ORDER BY d.created_at DESC
			       ) AS rn
			FROM dispatches d
			JOIN auto_match_logs aml ON aml.dispatch_id = d.id
			WHERE d.status IN ('pending_approval', 'queued')
		)
		UPDATE dispatches SET status = 'failed'
		WHERE id IN (SELECT id FROM ranked WHERE rn > 1)`)
	if err != nil {
		return nil, nil, "", fmt.Errorf("dedup: %w", err)
	}
	dedupedCount, _ := resDedup.RowsAffected()

	// Passo 2: contar e expirar targets stale
	var beforeStale int
	_ = h.db.GetContext(ctx, &beforeStale, `
		SELECT COUNT(*) FROM dispatch_targets dt
		JOIN dispatches d ON d.id = dt.dispatch_id
		WHERE dt.status = 'pending' AND d.created_at < now() - interval '2 hours'`)

	resExpire, err := h.db.ExecContext(ctx, `
		UPDATE dispatch_targets dt
		SET status = 'failed',
		    error_reason = 'expirado pelo Jonfrey'
		FROM dispatches d
		WHERE dt.dispatch_id = d.id
		  AND dt.status = 'pending'
		  AND d.created_at < now() - interval '2 hours'`)
	if err != nil {
		return nil, nil, "", err
	}
	expiredCount, _ := resExpire.RowsAffected()

	beforeMap := map[string]any{"stale_pending_count": beforeStale}
	afterMap := map[string]any{"rejected_duplicates": dedupedCount, "expired": expiredCount}
	reasoning := fmt.Sprintf("Marquei %d dispatches duplicados como failed. Expirei %d targets pending há mais de 2h (hora do dispatch) como failed para liberar a fila.", dedupedCount, expiredCount)
	return beforeMap, afterMap, reasoning, nil
}

// actionMaintainTaxonomy: consolida marcas e categorias duplicadas e revisa taxonomia pendente.
// Combina dedup_brands_categories e curate_taxonomy numa única action com 1 chamada LLM.
func actionMaintainTaxonomy(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
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

	// Sem sinais no catálogo (top marcas/tags) e sem taxonomia pendente → prompt só com
	// instruções e JSON vazio; não chama LLM (custo/latência inúteis).
	if len(brands) == 0 && len(tags) == 0 && len(compactPending) == 0 {
		beforeMap := map[string]any{
			"brands_evaluated": 0, "tags_evaluated": 0,
			"pending_taxonomy": 0, "approved_taxonomy": len(approved),
		}
		afterMap := map[string]any{
			"llm_skipped":        true,
			"skip_reason":        "no_catalog_brands_tags_and_no_pending_taxonomy",
			"brand_groups_found": 0,
			"tag_groups_found":   0,
			"brands_merged":      0,
			"tags_merged":        0,
			"taxonomy_approved":  0,
			"taxonomy_rejected":  0,
			"taxonomy_merged":    0,
			"taxonomy_enriched":  0,
		}
		reasoning := "Catálogo sem marcas/tags entre produtos ativos e nenhum termo de taxonomia pendente — maintain_taxonomy não chamou LLM."
		return beforeMap, afterMap, reasoning, nil
	}

	if h.llmFn == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
	}
	cli := h.llmFn()
	if cli == nil {
		return nil, nil, "", fmt.Errorf("LLM não configurado")
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

	// Saída grande + modelos thinking (MiMo/Qwen) podiam esgotar max_tokens só em reasoning.
	// Cliente injeta chat_template_kwargs enable_thinking=false em vLLM; orçamento alto na 1ª tentativa.
	ctxC, cancel := context.WithTimeout(ctx, 180*time.Second)
	resp, err := cli.Complete(ctxC, prompt, llm.Options{
		MaxTokens:   16384,
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
			ID            int64           `json:"id"`
			Action        string          `json:"action"`
			MergeID       json.RawMessage `json:"merge_id"`
			ExtraKeywords []string        `json:"extra_keywords"`
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
			mid := flexMergeID(d.MergeID)
			target, ok := approvedByID[mid]
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
		slog.Warn("jonfrey auto_release_pending: GetConfig", "err", err)
		return nil, nil, "", err
	}
	if !cfg.FullAutoMode {
		slog.Info("jonfrey auto_release_pending: ignorado — FullAutoMode=false (sem passar pending_approval→queued)")
		return map[string]any{"full_auto_mode": false},
			map[string]any{"released": 0, "skipped": "full_auto_mode desligado"},
			"Full-auto desligado — sem release automático. Aprove manualmente ou ative em Configurações.",
			nil
	}
	var before int
	if err := h.db.GetContext(ctx, &before, `SELECT COUNT(*) FROM dispatches WHERE status = 'pending_approval'`); err != nil {
		if pqErr, ok := err.(*pq.Error); ok && string(pqErr.Code) == "42P01" {
			// Tabela dispatches removida — sistema migrou para Score Engine (send_queue).
			// O algo tick roda incondicionalmente via scheduler (toggle use_algo_tick queimado em W0).
			slog.Info("jonfrey auto_release_pending: tabela dispatches ausente — sistema usa Score Engine, ignorando")
			return map[string]any{"dispatches_table": "absent"},
				map[string]any{"released": 0, "note": "sistema migrou para Score Engine"},
				"Tabela dispatches não existe — o sistema usa Score Engine (send_queue). Envios automáticos ocorrem via algo tick incondicional (cron 5min).",
				nil
		}
	}
	slog.Info("jonfrey auto_release_pending: antes do UPDATE",
		"pending_approval_count", before,
		"full_auto_mode", cfg.FullAutoMode,
	)
	res, err := h.db.ExecContext(ctx, `UPDATE dispatches SET status = 'queued' WHERE status = 'pending_approval'`)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && string(pqErr.Code) == "42P01" {
			slog.Info("jonfrey auto_release_pending: tabela dispatches ausente no UPDATE — no-op")
			return map[string]any{"dispatches_table": "absent"},
				map[string]any{"released": 0},
				"Score Engine ativo — dispatches não são mais usados.",
				nil
		}
		slog.Error("jonfrey auto_release_pending: UPDATE falhou", "err", err)
		return nil, nil, "", err
	}
	released, _ := res.RowsAffected()
	slog.Info("jonfrey auto_release_pending: depois do UPDATE",
		"released_rows", released,
		"pending_approval_before", before,
	)
	if released == 0 && before == 0 {
		slog.Info("jonfrey auto_release_pending: zero linhas — não havia dispatches em pending_approval (UI pode falar em 'envio' mas fila de aprovação estava vazia)",
			"released_rows", released,
		)
	}
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

// actionComputeClusters: removido em v2 — clusters são gerenciados externamente.
func actionComputeClusters(_ context.Context, _ *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	return map[string]any{"removed": true},
		map[string]any{"skipped": true},
		"Clusters foram removidos do pipeline v2. Ação sem efeito.",
		nil
}

// actionOptimizeAudienceFromClicks: removido em v2 — modelo Channel foi substituído por channels_v2 com sliders.
func actionOptimizeAudienceFromClicks(_ context.Context, _ *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	return map[string]any{"removed": true},
		map[string]any{"skipped": true},
		"optimize_audience_from_clicks removida em v2. Audiência agora é controlada pelos sliders de categoria por canal em /channels.",
		nil
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

// actionPauseDeadCrawlers: pausa searchterms ativos com crawls sem produtos (ml+amz=0), último crawl há 14+ dias e ≥5 crawls vazios em 30d.
func actionPauseDeadCrawlers(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	// Schema: searchterm.query, crawllog.search_term_id, started_at/finished_at, ml_count/amz_count (sem result_count/created_at).
	// “Sem resultados” = ml_count+amz_count = 0 no log; última atividade = maior timestamp de crawl conhecido.
	var deadCount int
	err := h.db.GetContext(ctx, &deadCount, `
		SELECT COUNT(*) FROM searchterm s
		WHERE s.active = true
		  AND COALESCE((
		      SELECT MAX(GREATEST(cl.started_at, COALESCE(cl.finished_at, cl.started_at)))
		      FROM crawllog cl
		      WHERE cl.search_term_id = s.id
		  ), '-infinity'::timestamptz) < now() - interval '14 days'
		  AND (
		      SELECT COUNT(*) FROM crawllog cl
		      WHERE cl.search_term_id = s.id
		        AND (cl.ml_count + cl.amz_count) = 0
		        AND cl.started_at > now() - interval '30 days'
		  ) >= 5`)
	if err != nil {
		return nil, nil, "", err
	}

	resPause, err := h.db.ExecContext(ctx, `
		UPDATE searchterm s SET active = false
		WHERE s.active = true
		  AND COALESCE((
		      SELECT MAX(GREATEST(cl.started_at, COALESCE(cl.finished_at, cl.started_at)))
		      FROM crawllog cl
		      WHERE cl.search_term_id = s.id
		  ), '-infinity'::timestamptz) < now() - interval '14 days'
		  AND (
		      SELECT COUNT(*) FROM crawllog cl
		      WHERE cl.search_term_id = s.id
		        AND (cl.ml_count + cl.amz_count) = 0
		        AND cl.started_at > now() - interval '30 days'
		  ) >= 5`)
	if err != nil {
		return nil, nil, "", err
	}
	paused, _ := resPause.RowsAffected()

	beforeMap := map[string]any{"dead_candidates": deadCount}
	afterMap := map[string]any{"paused": paused}
	reasoning := fmt.Sprintf("Identifiquei %d searchterms ativos sem crawls com produtos há 14+ dias e com ≥5 crawls vazios nos últimos 30d — pausei %d para revisão manual.", deadCount, paused)
	return beforeMap, afterMap, reasoning, nil
}

// actionEnrichTaxonomyFromUnmatched: audita próximos 100 produtos sem categoria primária
// Agrupa por similaridade de título; pede LLM JSON com sugestões; aplica se confiança ≥0.85
func actionEnrichTaxonomyFromUnmatched(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	ctx, cancel := context.WithTimeout(ctx, jonfreyLLMOuterBudget)
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
			MaxTokens:   1500,
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
	ctx, cancel := context.WithTimeout(ctx, jonfreyLLMOuterBudget)
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
			MaxTokens:   1200,
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
	ctx, cancel := context.WithTimeout(ctx, jonfreyLLMOuterBudget)
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
			MaxTokens:   1500,
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

// ── channel_category_sync ────────────────────────────────────────────────────

// keywordsForCategory busca keywords da tabela category_keywords no banco.
// Zero hardcode — tudo configurável pelo admin/Jonfrey.
func keywordsForCategory(ctx context.Context, db *sqlx.DB, slug string) ([]string, error) {
	var patterns []string
	err := db.SelectContext(ctx, &patterns,
		`SELECT pattern FROM category_keywords WHERE category_slug=$1 AND active=true ORDER BY id`, slug)
	return patterns, err
}

// slugFromChannelName deriva um slug de categoria a partir do nome do canal.
func slugFromChannelName(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "tênis") || strings.Contains(lower, "tenis") || strings.Contains(lower, "esporte"):
		return "tenis"
	case strings.Contains(lower, "cosm"):
		return "cosmetico"
	case strings.Contains(lower, "gaming") || strings.Contains(lower, "game"):
		return "gaming"
	case strings.Contains(lower, "café") || strings.Contains(lower, "cafe") || strings.Contains(lower, "bebida"):
		return "cafe"
	case strings.Contains(lower, "churras"):
		return "churras"
	case strings.Contains(lower, "casa") || strings.Contains(lower, "deco"):
		return "casa"
	case strings.Contains(lower, "moda") || strings.Contains(lower, "roupa"):
		return "moda"
	case strings.Contains(lower, "suplemento") || strings.Contains(lower, "whey"):
		return "suplemento"
	case strings.Contains(lower, "tech") || strings.Contains(lower, "eletr"):
		return "eletronico"
	default:
		return ""
	}
}

func actionChannelCategorySync(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	// 1. Carregar canais
	type channel struct {
		ID   int64  `db:"id"`
		Name string `db:"name"`
	}
	var channels []channel
	if err := h.db.SelectContext(ctx, &channels, `SELECT id, name FROM channels_v2 ORDER BY id`); err != nil {
		return nil, nil, "", fmt.Errorf("listar canais: %w", err)
	}

	// 2. Carregar categorias existentes (slug → id)
	type cat struct {
		ID   int64  `db:"id"`
		Slug string `db:"slug"`
		Name string `db:"display_name"`
	}
	var cats []cat
	_ = h.db.SelectContext(ctx, &cats, `SELECT id, slug, display_name FROM categories`)
	catBySlug := map[string]int64{}
	for _, c := range cats {
		catBySlug[c.Slug] = c.ID
	}

	created := 0
	reclassified := 0
	weightUpdated := 0

	for _, ch := range channels {
		slug := slugFromChannelName(ch.Name)
		if slug == "" {
			continue
		}
		keywords, _ := keywordsForCategory(ctx, h.db, slug)
		if len(keywords) == 0 {
			continue
		}

		// 3. Criar categoria se não existir
		catID, exists := catBySlug[slug]
		if !exists {
			var newID int64
			err := h.db.QueryRowContext(ctx, `
				INSERT INTO categories (slug, display_name, weight)
				VALUES ($1, $2, 1.0)
				ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
				RETURNING id
			`, slug, ch.Name).Scan(&newID)
			if err != nil {
				continue
			}
			catID = newID
			catBySlug[slug] = catID
			created++
			_ = jonfreyAuditAction(ctx, h.db, "channel_category_sync", "applied", "categories", catID,
				nil, map[string]any{"slug": slug, "name": ch.Name, "channel_id": ch.ID},
				fmt.Sprintf("categoria criada para canal '%s'", ch.Name), 1.0)
		}

		// 4. Re-classificar produtos sem categoria usando keywords ILIKE — só se a query retornar algum resultado
		for _, kw := range keywords {
			q := `UPDATE catalog SET category_id = $1
				WHERE category_id IS NULL
				  AND LOWER(title) ILIKE $2`
			res, err := h.db.ExecContext(ctx, q, catID, kw)
			if err == nil {
				if rows, _ := res.RowsAffected(); rows > 0 {
					reclassified += int(rows)
					_ = jonfreyAuditAction(ctx, h.db, "channel_category_sync", "applied", "catalog", catID,
						nil, map[string]any{"category_id": catID},
						fmt.Sprintf("re-classificados %d produtos (keyword: %s)", rows, kw), 0.95)
				}
			}
		}

		// 5. Garantir que channel_category_weights aponta para a categoria correta
		var existingWeight int
		err := h.db.GetContext(ctx, &existingWeight, `
			SELECT weight FROM channel_category_weights
			WHERE channel_id = $1 AND category_id = $2`, ch.ID, catID)
		if err != nil || existingWeight == 0 {
			_, _ = h.db.ExecContext(ctx, `
				INSERT INTO channel_category_weights (channel_id, category_id, weight)
				VALUES ($1, $2, 100)
				ON CONFLICT (channel_id, category_id) DO UPDATE SET weight = 100
			`, ch.ID, catID)
			weightUpdated++
		}
	}

	before := map[string]any{"categories_created": 0, "products_reclassified": 0}
	after := map[string]any{
		"categories_created":   created,
		"products_reclassified": reclassified,
		"weights_updated":      weightUpdated,
	}
	reasoning := fmt.Sprintf("sync canal→categoria: %d categorias criadas, %d produtos re-classificados, %d pesos atualizados",
		created, reclassified, weightUpdated)
	return before, after, reasoning, nil
}

func actionCatalogBrandClassification(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	tx, err := h.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, nil, "", err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO product_brands (slug, display_name)
		SELECT brand_slug, MAX(brand_display) FROM brand_keywords GROUP BY brand_slug
		ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
	`); err != nil {
		return nil, nil, "", err
	}

	res, err := tx.ExecContext(ctx, `
		WITH x AS (
			SELECT c.id,
				NULLIF(bm.slug, '') AS bslug,
				CASE WHEN NULLIF(bm.slug, '') IS NOT NULL THEN
					(SELECT cat.id FROM categories cat
					 WHERE cat.slug = NULLIF(cm.slug, '')
					 LIMIT 1)
				END AS cid
			FROM catalog c
			CROSS JOIN LATERAL (
				SELECT (classify_catalog_brand(c.title)).slug AS slug
			) bm
			CROSS JOIN LATERAL (
				SELECT (classify_catalog_category(c.title, COALESCE(c.source_id::text, ''))).slug AS slug
			) cm
			WHERE (c.brand IS NULL OR c.brand = '') AND c.title IS NOT NULL AND c.title <> ''
		)
		UPDATE catalog c SET
			brand = x.bslug,
			brand_id = pb.id,
			category_id = x.cid,
			updated_at = now()
		FROM x
		LEFT JOIN product_brands pb ON pb.slug = x.bslug
		WHERE c.id = x.id
	`)
	if err != nil {
		return nil, nil, "", err
	}
	n, _ := res.RowsAffected()

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO product_brands (slug, display_name)
		SELECT DISTINCT brand, brand FROM catalog WHERE brand IS NOT NULL AND btrim(brand) <> ''
		ON CONFLICT (slug) DO NOTHING
	`); err != nil {
		return nil, nil, "", err
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE catalog c SET brand_id = pb.id
		FROM product_brands pb
		WHERE c.brand = pb.slug AND (c.brand_id IS NULL OR c.brand_id <> pb.id)
	`); err != nil {
		return nil, nil, "", err
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, "", err
	}

	before := map[string]any{"classified": 0}
	after := map[string]any{"classified": n}
	reasoning := fmt.Sprintf("classificados %d produtos com brand (heurística) + brand_id", n)
	_ = jonfreyAuditAction(ctx, h.db, "catalog_brand_classification", "applied", "catalog", 0, before, after, reasoning, 1.0)
	return before, after, reasoning, nil
}

// actionTuneBanditExploration chama o regulator de bandit para cada canal ativo.
// Para cada canal, jonfrey_regulator.RegulateChannelBandit avalia UCB1 state e decide
// se deve aumentar exploration_factor (estagnação) ou registrar freeze_channel (queda sustentada).
// Implementa a ação tune_bandit_exploration do seed W5 (invariante I10, loop de correção parte 2).
func actionTuneBanditExploration(ctx context.Context, h *JonfreyHandler) (map[string]any, map[string]any, string, error) {
	// Busca todos os canais ativos para rodar o ciclo do regulator.
	type channel struct {
		ID   int64  `db:"id"`
		Name string `db:"name"`
	}

	var channels []channel
	if err := h.db.SelectContext(ctx, &channels, `SELECT id, name FROM channels_v2 ORDER BY id`); err != nil {
		return nil, nil, "", fmt.Errorf("listar canais para tune_bandit: %w", err)
	}

	before := map[string]any{"channels_count": len(channels)}

	// Itera sobre cada canal e executa um ciclo de regulação do bandit.
	var regulated int
	var errs []string
	for _, ch := range channels {
		if ctx.Err() != nil {
			break
		}

		if err := jonfrey_regulator.RegulateChannelBandit(ctx, h.db, ch.ID); err != nil {
			errs = append(errs, fmt.Sprintf("channel %d (%s): %v", ch.ID, ch.Name, err))
			continue
		}
		regulated++
	}

	after := map[string]any{
		"regulated": regulated,
		"errors":    errs,
	}
	reasoning := fmt.Sprintf("Regulei bandit em %d/%d canais ativos.", regulated, len(channels))

	return before, after, reasoning, nil
}

// jonfreyAuditAction grava uma ação automatizada em llm_actions com before/after.
// Inlined de internal/services/loops/audit.go (loops package removido em W0).
func jonfreyAuditAction(ctx context.Context, db *sqlx.DB, loopName, actionType, targetTable string, targetID int64, before, after any, reasoning string, confidence float64) error {
	b, _ := json.Marshal(before)
	a, _ := json.Marshal(after)
	_, err := db.ExecContext(ctx, `
		INSERT INTO llm_actions (loop_name, action_type, target_table, target_id, before_value, after_value, reasoning, confidence, evaluation, applied_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', now())
	`, loopName, actionType, targetTable, targetID, b, a, reasoning, confidence)
	return err
}

