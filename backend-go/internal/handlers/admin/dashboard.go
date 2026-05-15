package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/notifier"
	store "snatcher/backendv2/internal/repositories"

	"github.com/jmoiron/sqlx"
)

type DashboardHandler struct {
	store store.Store
	db    *sqlx.DB
	llmFn func() llm.Client
	notif *notifier.Notifier // pode ser nil

	recoMu     sync.Mutex
	recoCache  *recommendationResp
	recoCachedAt time.Time
}

type recommendationResp struct {
	Headline    string   `json:"headline"`
	Reason      string   `json:"reason"`
	Actions     []string `json:"actions"`
	GeneratedAt string   `json:"generated_at"`
	CachedFor   int      `json:"cached_for_seconds"` // segundos restantes do cache
}

func NewDashboardHandler(st store.Store, db *sqlx.DB) *DashboardHandler {
	return &DashboardHandler{store: st, db: db}
}

func (h *DashboardHandler) SetLLMFn(fn func() llm.Client) { h.llmFn = fn }
func (h *DashboardHandler) SetNotifier(n *notifier.Notifier) { h.notif = n }

// GET /api/dashboard/kpis — retorna KPIs com deltas WoW + saúde anti-ban.
//
//	@Summary      Dashboard KPIs
//	@Description  KPIs com deltas semana-a-semana, CTR, clicks únicos e health score.
//	@Tags         dashboard
//	@Produce      json
//	@Success      200  {object}  object
//	@Router       /api/dashboard/kpis [get]
func (h *DashboardHandler) KPIs(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	week0Start := now.Add(-7 * 24 * time.Hour)  // [now-7d, now]
	week1Start := now.Add(-14 * 24 * time.Hour) // [now-14d, now-7d]

	// Dispatches: semana atual vs semana anterior
	var dispatches7d, dispatchesPrev int
	_ = h.db.GetContext(r.Context(), &dispatches7d,
		`SELECT COUNT(*) FROM dispatches WHERE created_at >= $1`, week0Start)
	_ = h.db.GetContext(r.Context(), &dispatchesPrev,
		`SELECT COUNT(*) FROM dispatches WHERE created_at >= $1 AND created_at < $2`, week1Start, week0Start)

	dispatchesDeltaPct := 0.0
	if dispatchesPrev > 0 {
		dispatchesDeltaPct = float64(dispatches7d-dispatchesPrev) / float64(dispatchesPrev) * 100
	}

	// Clicks: semana atual
	var clicks7d, clicksPrev int
	_ = h.db.GetContext(r.Context(), &clicks7d,
		`SELECT COALESCE(SUM(click_count),0) FROM dispatch_targets
		 WHERE created_at >= $1`, week0Start)
	_ = h.db.GetContext(r.Context(), &clicksPrev,
		`SELECT COALESCE(SUM(click_count),0) FROM dispatch_targets
		 WHERE created_at >= $1 AND created_at < $2`, week1Start, week0Start)

	// unique_clicks_7d: COUNT(DISTINCT ip_hash) FROM clicklog nos últimos 7 dias.
	var uniqueClicks7d int
	_ = h.db.GetContext(r.Context(), &uniqueClicks7d,
		`SELECT COUNT(DISTINCT ip_hash) FROM clicklog WHERE clicked_at >= $1`, week0Start)

	// CTR: clicks / dispatches (em %)
	ctrAvg := 0.0
	if dispatches7d > 0 {
		ctrAvg = float64(clicks7d) / float64(dispatches7d) * 100
	}
	ctrPrev := 0.0
	if dispatchesPrev > 0 {
		ctrPrev = float64(clicksPrev) / float64(dispatchesPrev) * 100
	}
	ctrAvgPPDelta := ctrAvg - ctrPrev

	// Health score baseado em accounts v2.
	// Heurística: (active - banned*2 - quarantine) / total * 100, clamp [0,100].
	// active = primary|backup|warming; banned = banned; quarantine = quarantine.
	// Penalidade adicional: grupos ativos com admin_count < 2 reduzem o score (peso pequeno).
	// Se sem contas → null.
	accounts, err := h.store.ListAccountsV2()
	var healthScore *int
	accountsNormalCount := 0
	if err == nil && len(accounts) > 0 {
		total := len(accounts)
		active, banned, disconnected := 0, 0, 0
		for _, a := range accounts {
			switch a.Status {
			case "primary", "backup", "warming":
				active++
				accountsNormalCount++
			case "banned":
				banned++
			case "quarantine":
				disconnected++
			}
		}
		raw := float64(active-banned*2-disconnected) / float64(total) * 100

		// Penalidade: grupos ativos com admin_count < 2 — cada grupo penaliza 1 ponto (máx 10)
		if h.db != nil {
			var underAdminCount int
			_ = h.db.GetContext(r.Context(), &underAdminCount, `
				SELECT COUNT(*) FROM groups g
				WHERE g.status = 'active'
				  AND (SELECT COUNT(*) FROM group_admins ga WHERE ga.group_id = g.id) < 2`)
			penalty := float64(underAdminCount)
			if penalty > 10 {
				penalty = 10
			}
			raw -= penalty
		}

		if raw < 0 {
			raw = 0
		}
		if raw > 100 {
			raw = 100
		}
		score := int(raw)
		healthScore = &score
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"dispatches_7d":        dispatches7d,
		"dispatches_delta_pct": dispatchesDeltaPct,
		"ctr_avg":              ctrAvg,
		"ctr_avg_pp_delta":     ctrAvgPPDelta,
		"clicks_7d":            clicks7d,
		"unique_clicks_7d":     uniqueClicks7d,
		"health_score":         healthScore,
		"accounts_normal_count": accountsNormalCount,
	})
}

// GET /api/dashboard/feed — produtos recentes do catálogo
func (h *DashboardHandler) Feed(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT cp.id, cp.canonical_name as title, cp.lowest_price as price_current,
		       cp.image_url, cp.lowest_price_source as marketplace,
		       cp.created_at as collected_at
		FROM catalogproduct cp
		ORDER BY cp.created_at DESC
		LIMIT 30`)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"items": []any{}})
		return
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	var items []map[string]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		m := make(map[string]any, len(cols))
		for i, col := range cols {
			m[col] = vals[i]
		}
		items = append(items, m)
	}
	if items == nil {
		items = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// Inbox retorna alertas críticos do sistema para exibir no dashboard.
//
//	@Summary      Dashboard inbox
//	@Description  Retorna lista de alertas com severity, category e CTA.
//	@Tags         dashboard
//	@Produce      json
//	@Success      200  {array}   object
//	@Router       /api/dashboard/inbox [get]
func (h *DashboardHandler) Inbox(w http.ResponseWriter, r *http.Request) {
	type CTA struct {
		Label string `json:"label"`
		Href  string `json:"href"`
	}
	type Alert struct {
		ID       string `json:"id"`
		Severity string `json:"severity"` // "critico" | "atencao"
		Category string `json:"category"` // "wa_disconnect" | "crawler_fail" | "curation_pending" | "group_fail"
		Title    string `json:"title"`
		Subtitle string `json:"subtitle"`
		CTA      CTA    `json:"cta"`
	}

	var alerts []Alert

	// Categoria: wa_disconnect — contas WA em quarentena ou banidas (accounts v2)
	accounts, _ := h.store.ListAccountsV2()
	for _, a := range accounts {
		if a.Status == "quarantine" || a.Status == "banned" {
			severity := "atencao"
			if a.Status == "banned" {
				severity = "critico"
			}
			alerts = append(alerts, Alert{
				ID:       fmt.Sprintf("wa-%d", a.ID),
				Severity: severity,
				Category: "wa_disconnect",
				Title:    fmt.Sprintf("Conta WhatsApp %q %s", a.Phone, a.Status),
				Subtitle: "sem atividade",
				CTA:      CTA{Label: "Reconectar via QR", Href: "/accounts"},
			})
		}
	}

	// Categoria: crawler_fail — heurísticas para detectar crawlers quebrados
	// H1: erros consecutivos (≥2 das últimas 3 execuções falharam) → critico
	// H2: overdue (não executa há >2× o intervalo esperado) → atencao
	// H3: rodou mas sem resultados → atencao
	// Ignora: crawlers desativados (não entram no ciclo) e os marcados inbox_muted (lista “problemáticos” sem ruído no dashboard).
	terms, _ := h.store.ListSearchTerms()

	type consRow struct {
		SearchTermID int64 `db:"search_term_id"`
		ErrCount     int   `db:"err_count"`
		TotalRecent  int   `db:"total_recent"`
	}
	var consErrors []consRow
	if h.db != nil && len(terms) > 0 {
		_ = h.db.SelectContext(r.Context(), &consErrors, `
			WITH ranked AS (
				SELECT search_term_id, status,
				       ROW_NUMBER() OVER (PARTITION BY search_term_id ORDER BY started_at DESC) AS rn
				FROM crawllog
			)
			SELECT search_term_id,
			       COUNT(*) FILTER (WHERE status = 'error') AS err_count,
			       COUNT(*) AS total_recent
			FROM ranked
			WHERE rn <= 3
			GROUP BY search_term_id`)
	}
	errByTerm := make(map[int64]consRow, len(consErrors))
	for _, e := range consErrors {
		errByTerm[e.SearchTermID] = e
	}

	now := time.Now()
	for _, t := range terms {
		if !t.Active || t.InboxMuted {
			continue
		}
		interval := t.CrawlInterval
		if interval <= 0 {
			interval = 60
		}

		var severity, subtitle string

		if e, ok := errByTerm[t.ID]; ok && e.TotalRecent >= 2 && e.ErrCount >= 2 {
			// H1: erros consecutivos — crawler quebrado
			severity = "critico"
			subtitle = fmt.Sprintf("%d/%d execuções recentes falharam — reparar imediatamente", e.ErrCount, e.TotalRecent)
		} else if t.LastCrawledAt.Valid && now.Sub(t.LastCrawledAt.Time) > time.Duration(interval*3)*time.Minute {
			// H2: overdue — parou de executar (3× evita falsos positivos após restart do scheduler)
			hoursLate := now.Sub(t.LastCrawledAt.Time).Hours()
			severity = "atencao"
			subtitle = fmt.Sprintf("não executa há %.0fh (esperado a cada %dmin)", hoursLate, interval)
		} else if t.LastCrawledAt.Valid && t.ResultCount == 0 {
			// H3: rodou mas encontrou zero produtos
			severity = "atencao"
			subtitle = "última execução sem produtos"
		}

		if severity != "" {
			alerts = append(alerts, Alert{
				ID:       fmt.Sprintf("crawler-%d", t.ID),
				Severity: severity,
				Category: "crawler_fail",
				Title:    fmt.Sprintf("Crawler %q quebrado", t.Query),
				Subtitle: subtitle,
				CTA:      CTA{Label: "Ver detalhes", Href: fmt.Sprintf("/crawlers?termId=%d", t.ID)},
			})
		}
	}

	// Categoria: curation_pending — catalogproduct com curation_status='pending' nos últimos 7 dias
	if h.db != nil {
		since7d := time.Now().Add(-7 * 24 * time.Hour)
		var pendingCount int
		_ = h.db.GetContext(r.Context(), &pendingCount,
			`SELECT COUNT(*) FROM catalogproduct WHERE curation_status='pending' AND created_at >= $1`, since7d)
		if pendingCount > 0 {
			alerts = append(alerts, Alert{
				ID:       "curation_pending",
				Severity: "atencao",
				Category: "curation_pending",
				Title:    fmt.Sprintf("%d produto(s) aguardando curação", pendingCount),
				Subtitle: "últimos 7 dias",
				CTA:      CTA{Label: "Ver catálogo", Href: "/catalog?tab=novos"},
			})
		}
	}

	// Categoria: group_fail — grupos arquivados ou com last_error preenchido
	if h.db != nil {
		type failRow struct {
			ID        int64  `db:"id"`
			Name      string `db:"name"`
			Archived  bool   `db:"archived"`
			LastError string `db:"last_error"`
		}
		var failGroups []failRow
		_ = h.db.SelectContext(r.Context(), &failGroups,
			`SELECT id, name, COALESCE(archived, false) AS archived, COALESCE(last_error, '') AS last_error
			 FROM groups WHERE archived = true OR last_error IS NOT NULL LIMIT 10`)
		for _, fg := range failGroups {
			severity := "atencao"
			subtitle := "erro detectado"
			if fg.Archived {
				severity = "critico"
				subtitle = "arquivado"
			}
			if fg.LastError != "" {
				subtitle = fg.LastError
			}
			alerts = append(alerts, Alert{
				ID:       fmt.Sprintf("group_fail-%d", fg.ID),
				Severity: severity,
				Category: "group_fail",
				Title:    fmt.Sprintf("Grupo %q com falha", fg.Name),
				Subtitle: subtitle,
				CTA:      CTA{Label: "Ver grupo", Href: fmt.Sprintf("/groups/%d", fg.ID)},
			})
		}
	}

	// Categoria: jonfrey_fail — última execução terminou em falha para uma automação que está ligada na lista (só se auto-pilot Jonfrey ativo).
	jfCfg, jfErr := h.store.GetJonfreyConfig()
	if jfErr == nil && h.db != nil && jfCfg.Enabled && len(jfCfg.EnabledActions) > 0 {
		lastBy, _ := h.store.JonfreyLastRunByActionType()
		for _, actionType := range jfCfg.EnabledActions {
			if actionType == "" {
				continue
			}
			canonical := resolveJonfreyActionType(actionType)
			sum, ok := lastBy[canonical]
			if !ok && canonical != actionType {
				sum, ok = lastBy[actionType]
			}
			if !ok || sum.Status != "failed" {
				continue
			}
			var errMsg string
			if canonical == actionType {
				_ = h.db.GetContext(r.Context(), &errMsg, `
				SELECT COALESCE(error_message, '') FROM jonfrey_actions
				WHERE action_type = $1 AND status = 'failed' AND finished_at IS NOT NULL
				ORDER BY finished_at DESC LIMIT 1`, actionType)
			} else {
				_ = h.db.GetContext(r.Context(), &errMsg, `
				SELECT COALESCE(error_message, '') FROM jonfrey_actions
				WHERE action_type IN ($1, $2) AND status = 'failed' AND finished_at IS NOT NULL
				ORDER BY finished_at DESC LIMIT 1`, canonical, actionType)
			}
			sub := strings.TrimSpace(errMsg)
			if sub == "" {
				sub = "Última execução falhou — ver detalhes em Jonfrey"
			}
			if len(sub) > 220 {
				sub = sub[:217] + "…"
			}
			alerts = append(alerts, Alert{
				ID:       fmt.Sprintf("jonfrey_fail-%s", canonical),
				Severity: "critico",
				Category: "jonfrey_fail",
				Title:    fmt.Sprintf("Jonfrey: %s falhou", titleJonfreyAction(canonical)),
				Subtitle: sub,
				CTA:      CTA{Label: "Abrir Jonfrey", Href: "/automations/jonfrey"},
			})
		}
	}

	if alerts == nil {
		alerts = []Alert{}
	}
	writeJSON(w, http.StatusOK, alerts)
}

// Performance retorna tabela de performance por canal nos últimos 7 dias com sparkline.
//
//	@Summary      Dashboard performance
//	@Description  Retorna tabela de performance por canal (7 dias) com daily_dispatches sparkline.
//	@Tags         dashboard
//	@Produce      json
//	@Success      200  {array}   object
//	@Router       /api/dashboard/performance [get]
//	@Router       /api/dashboard/channel-performance [get]
func (h *DashboardHandler) Performance(w http.ResponseWriter, r *http.Request) {
	type ChannelPerf struct {
		ChannelID      int64   `db:"channel_id"    json:"channel_id"`
		ChannelName    string  `db:"channel_name"  json:"channel_name"`
		Dispatches     int     `db:"dispatches"    json:"dispatches"`
		CTR            float64 `db:"ctr"           json:"ctr"`
		DailyDispatches []int  `json:"daily_dispatches"` // 7 valores [D-6..D-0]
	}

	var rows []ChannelPerf
	_ = h.db.SelectContext(r.Context(), &rows, `
		SELECT c.id as channel_id, c.name as channel_name,
		       COUNT(DISTINCT dt.id) as dispatches,
		       0.0 as ctr
		FROM channel c
		LEFT JOIN groups g ON g.channel_id = c.id
		LEFT JOIN dispatch_targets dt ON dt.group_id = g.id
		    AND dt.delivered_at > now() - interval '7 days'
		WHERE c.active = true
		GROUP BY c.id, c.name
		ORDER BY dispatches DESC
		LIMIT 5
	`)

	if rows == nil {
		rows = []ChannelPerf{}
	}

	// Preencher daily_dispatches com query por canal (7 valores, D-6 a D-0)
	type dayCount struct {
		DayOffset int `db:"day_offset"`
		Count     int `db:"cnt"`
	}
	for i := range rows {
		var dayCounts []dayCount
		_ = h.db.SelectContext(r.Context(), &dayCounts, `
			SELECT gs.day_offset, COALESCE(COUNT(dt.id), 0) as cnt
			FROM generate_series(0, 6) AS gs(day_offset)
			LEFT JOIN groups g ON g.channel_id = $1
			LEFT JOIN dispatch_targets dt
			    ON dt.group_id = g.id
			    AND DATE_TRUNC('day', dt.delivered_at) = DATE_TRUNC('day', now() - (gs.day_offset || ' days')::interval)
			GROUP BY gs.day_offset
			ORDER BY gs.day_offset DESC
		`, rows[i].ChannelID)

		daily := make([]int, 7)
		for _, dc := range dayCounts {
			if dc.DayOffset >= 0 && dc.DayOffset < 7 {
				// day_offset 0 = today (index 6), 6 = 6 days ago (index 0)
				daily[6-dc.DayOffset] = dc.Count
			}
		}
		rows[i].DailyDispatches = daily
	}

	writeJSON(w, http.StatusOK, rows)
}

// GET /api/dashboard/automation-diagnostics — flags, contagens de dispatch, Evolution, rate limit WA, backpressure, Jonfrey e qualidade do catálogo.
func (h *DashboardHandler) AutomationDiagnostics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cfg, err := h.store.GetConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	type stRow struct {
		Status string `db:"status"`
		Cnt    int    `db:"cnt"`
	}
	var stRows []stRow
	_ = h.db.SelectContext(ctx, &stRows, `SELECT COALESCE(status::text,'') AS status, COUNT(*)::int AS cnt FROM dispatches GROUP BY status`)
	dispatchCounts := make(map[string]int)
	for _, row := range stRows {
		k := row.Status
		if k == "" {
			k = "(null)"
		}
		dispatchCounts[k] = row.Cnt
	}

	evolutionOK, evolutionReason, evolutionAccountID := h.evolutionSnapshot(cfg)

	type grpDelivery struct {
		GroupID   int64  `db:"group_id"`
		GroupName string `db:"group_name"`
		Count     int    `db:"cnt"`
	}
	var topDeliveries []grpDelivery
	_ = h.db.SelectContext(ctx, &topDeliveries, `
		SELECT g.id AS group_id, g.name AS group_name, COUNT(*)::int AS cnt
		FROM dispatch_targets dt
		JOIN groups g ON g.id = dt.group_id
		WHERE dt.status IN ('delivered','sending')
		  AND COALESCE(dt.delivered_at, dt.updated_at, dt.created_at) > now() - interval '60 minutes'
		GROUP BY g.id, g.name
		ORDER BY cnt DESC
		LIMIT 12`)

	topSlice := make([]map[string]any, 0, len(topDeliveries))
	for _, g := range topDeliveries {
		topSlice = append(topSlice, map[string]any{
			"group_id":             g.GroupID,
			"group_name":           g.GroupName,
			"delivered_last_60min": g.Count,
		})
	}

	const maxPendingPerGroup = 10
	type grpPending struct {
		GroupID   int64  `db:"group_id"`
		GroupName string `db:"group_name"`
		Cnt       int    `db:"cnt"`
	}
	var backpressure []grpPending
	_ = h.db.SelectContext(ctx, &backpressure, `
		SELECT g.id AS group_id, g.name AS group_name, COUNT(*)::int AS cnt
		FROM dispatch_targets dt
		JOIN groups g ON g.id = dt.group_id
		WHERE dt.status IN ('pending','sending')
		GROUP BY g.id, g.name
		HAVING COUNT(*) >= $1
		ORDER BY cnt DESC
		LIMIT 20`, maxPendingPerGroup)

	bpSlice := make([]map[string]any, 0, len(backpressure))
	for _, g := range backpressure {
		bpSlice = append(bpSlice, map[string]any{
			"group_id":         g.GroupID,
			"group_name":       g.GroupName,
			"pending_targets":  g.Cnt,
		})
	}

	// TODO migrate to v2: ListChannelAutomations removed; aggregate from send_log/daily_metrics
	autoMatchCh := 0
	autoMatchPaused := 0

	channelsTextNoTax := 0
	var channelsMismatchSamples []map[string]any

	jfCfg, _ := h.store.GetJonfreyConfig()
	type jfRow struct {
		ActionType string    `json:"action_type"`
		Status     string    `json:"status"`
		CreatedAt  time.Time `json:"created_at"`
	}
	var jfRecent []jfRow
	_ = h.db.SelectContext(ctx, &jfRecent, `
		SELECT action_type, status, created_at FROM jonfrey_actions
		ORDER BY id DESC LIMIT 8`)

	var noPrimaryTax, totalProd, inspected int
	_ = h.db.GetContext(ctx, &noPrimaryTax, `
		SELECT COUNT(*) FROM catalogproduct cp WHERE NOT EXISTS (
		  SELECT 1 FROM catalogproduct_taxonomy cpt WHERE cpt.product_id = cp.id AND cpt.role = 'primary_category')`)
	_ = h.db.GetContext(ctx, &totalProd, `SELECT COUNT(*) FROM catalogproduct WHERE inactive = false`)
	_ = h.db.GetContext(ctx, &inspected, `SELECT COUNT(*) FROM catalogproduct WHERE inactive = false AND inspected = true`)

	inspectedPct := 0.0
	if totalProd > 0 {
		inspectedPct = float64(inspected) * 100.0 / float64(totalProd)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"flags": map[string]any{
			"auto_match_enabled":      cfg.AutoMatchEnabled,
			"full_auto_mode":          cfg.FullAutoMode,
			"auto_match_only_curated": cfg.AutoMatchOnlyCurated,
		},
		"dispatches_by_status": dispatchCounts,
		"evolution": map[string]any{
			"configured":           evolutionOK,
			"reason_if_not":        evolutionReason,
			"active_wa_account_id": evolutionAccountID,
		},
		"rate_limit_whatsapp": map[string]any{
			"max_messages_per_group_per_hour": 3,
			"window_minutes":                  60,
			"groups_most_active_last_hour":    topSlice,
		},
		"auto_match_channels": map[string]any{
			"with_auto_match_enabled": autoMatchCh,
			"paused_until_future":     autoMatchPaused,
		},
		"backpressure": map[string]any{
			"max_pending_targets_per_group": maxPendingPerGroup,
			"groups_at_or_over_cap":         bpSlice,
		},
		"audience_taxonomy_alignment": map[string]any{
			"active_channels_with_text_categories_but_no_taxonomy_ids": channelsTextNoTax,
			"sample_channels": channelsMismatchSamples,
			"hint":            "Prefira include_category_ids na audiência para match estável com produtos taxonomizados.",
		},
		"jonfrey": map[string]any{
			"enabled":          jfCfg.Enabled,
			"interval_minutes": jfCfg.IntervalMinutes,
			"recent_actions":   jfRecent,
		},
		"catalog_quality": map[string]any{
			"active_products_total":             totalProd,
			"active_products_inspected":           inspected,
			"active_products_inspected_pct":       inspectedPct,
			"products_missing_primary_taxonomy":   noPrimaryTax,
		},
	})
}

func (h *DashboardHandler) evolutionSnapshot(cfg models.AppConfig) (ok bool, reason string, accountID int64) {
	// F08b: Evolution credentials are global (appconfig). No per-account overrides.
	baseURL := cfg.WABaseURL.String
	apiKey := cfg.WAApiKey.String
	instance := cfg.WAInstance.String
	if baseURL != "" && apiKey != "" && instance != "" {
		return true, "", 0
	}
	return false, "Evolution não configurada: defina URL/chave/instância na config global.", 0
}

// UpcomingDispatches retorna os próximos disparos agendados.
//
//	@Summary      Dashboard upcoming dispatches
//	@Description  Lista disparos com status='scheduled' ordenados por ETA crescente.
//	@Tags         dashboard
//	@Produce      json
//	@Param        limit  query  int  false  "Limite de resultados (default 5)"
//	@Success      200    {array}  object
//	@Router       /api/dashboard/upcoming-dispatches [get]
func (h *DashboardHandler) UpcomingDispatches(w http.ResponseWriter, r *http.Request) {
	limit := 5
	if lq := r.URL.Query().Get("limit"); lq != "" {
		if n, err := strconv.Atoi(lq); err == nil && n > 0 {
			limit = n
		}
	}

	type UpcomingItem struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Subtitle   string `json:"subtitle"`
		ETASeconds int    `json:"eta_seconds"`
		Kind       string `json:"kind"` // "group" | "digest"
	}

	// send_queue substituiu dispatches. Mostra itens pending/sending ordenados
	// por enqueued_at. ETA estimado = posição na fila × 30s por envio.
	type rawRow struct {
		ID          int64  `db:"id"`
		GroupName   string `db:"group_name"`
		ProductName string `db:"product_name"`
		EnqueuedAt  string `db:"enqueued_at"`
		Status      string `db:"status"`
		Position    int    `db:"position"` // posição relativa na fila do grupo
	}

	var raws []rawRow
	err := h.db.SelectContext(r.Context(), &raws, `
		SELECT sq.id,
		       COALESCE(g.name, g.whatsapp_jid, sq.group_id::text) AS group_name,
		       COALESCE(c.title, 'Produto #' || sq.catalog_id)     AS product_name,
		       sq.enqueued_at::text AS enqueued_at,
		       sq.status,
		       ROW_NUMBER() OVER (ORDER BY sq.enqueued_at ASC)::int AS position
		FROM send_queue sq
		LEFT JOIN groups  g ON g.id = sq.group_id
		LEFT JOIN catalog c ON c.id = sq.catalog_id
		WHERE sq.status IN ('pending', 'sending')
		ORDER BY sq.enqueued_at ASC
		LIMIT $1
	`, limit)

	if err != nil || len(raws) == 0 {
		writeJSON(w, http.StatusOK, []UpcomingItem{})
		return
	}

	items := make([]UpcomingItem, 0, len(raws))
	for _, raw := range raws {
		etaSecs := raw.Position * 30 // ~30s por envio na fila
		if raw.Status == "sending" {
			etaSecs = 5
		}
		items = append(items, UpcomingItem{
			ID:         fmt.Sprintf("%d", raw.ID),
			Name:       raw.GroupName,
			Subtitle:   raw.ProductName,
			ETASeconds: etaSecs,
			Kind:       "group",
		})
	}

	writeJSON(w, http.StatusOK, items)
}

const recommendationTTL = 24 * time.Hour

// GET /api/dashboard/recommendation — sugere próxima ação operacional.
// TTL 24h. Cache em memória (hit rápido) + persistido no banco (sobrevive reboots).
//
// ?force=1 invalida o cache e força regeneração.
func (h *DashboardHandler) Recommendation(w http.ResponseWriter, r *http.Request) {
	force := r.URL.Query().Get("force") == "1"

	// 1) Tenta memória
	h.recoMu.Lock()
	cached := h.recoCache
	cachedAt := h.recoCachedAt
	h.recoMu.Unlock()

	if !force && cached != nil && time.Since(cachedAt) < recommendationTTL {
		out := *cached
		out.CachedFor = int(recommendationTTL.Seconds() - time.Since(cachedAt).Seconds())
		writeJSON(w, http.StatusOK, out)
		return
	}

	// 2) Tenta banco (persiste entre reboots)
	if !force {
		var dbRec struct {
			Headline    string    `db:"headline"`
			Reason      string    `db:"reason"`
			Actions     []byte    `db:"actions"`
			CachedAt    time.Time `db:"cached_at"`
		}
		if err := h.db.GetContext(r.Context(), &dbRec,
			`SELECT headline, reason, actions, cached_at FROM recommendation_cache WHERE id = 1`); err == nil {
			if time.Since(dbRec.CachedAt) < recommendationTTL {
				var actions []string
				_ = json.Unmarshal(dbRec.Actions, &actions)
				out := recommendationResp{
					Headline:    dbRec.Headline,
					Reason:      dbRec.Reason,
					Actions:     actions,
					GeneratedAt: dbRec.CachedAt.Format(time.RFC3339),
					CachedFor:   int(recommendationTTL.Seconds() - time.Since(dbRec.CachedAt).Seconds()),
				}
				h.recoMu.Lock()
				h.recoCache = &out
				h.recoCachedAt = dbRec.CachedAt
				h.recoMu.Unlock()
				writeJSON(w, http.StatusOK, out)
				return
			}
		}
	}

	if h.llmFn == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}

	// Snapshot do estado operacional atual
	snapshot := h.collectOperationalSnapshot(r.Context())

	prompt := fmt.Sprintf(`Operador sênior: promoções automáticas (catálogo, WA/TG, crawlers auto-match).

Use APENAS os dados locais abaixo. Não especule sobre tendências de mercado externas.

Ao priorizar, considere o encaixe entre: (1) audiência e categorias dos canais ativos, (2) fontes já cobertas pelos crawlers, (3) produtos sem URL de oferta ou sem categoria primária quando os números forem relevantes.

ESTADO (Snatcher):
%s

Escolha UMA prioridade óbvia (gargalo, risco ou quick win).

JSON estrito:
{
  "headline": "≤80 chars — próximo passo concreto",
  "reason": "1–2 frases só com base nos números acima",
  "actions": ["passo breve 1","passo 2","passo 3"]
}`, snapshot)

	// Sem WebSearch — snapshot já traz métricas; plugin web infla tokens/latência.
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	resp, err := cli.Complete(ctx, prompt, llm.Options{
		MaxTokens:   380,
		Temperature: 0.25,
		Operation:   "dashboard_recommendation",
		JSONMode:    true,
		WebSearch:   false,
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "LLM: "+err.Error())
		return
	}

	var parsed recommendationResp
	jsonStr := extractJSON(resp)
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		writeErr(w, http.StatusBadGateway, "LLM resposta inválida: "+err.Error())
		return
	}
	now := time.Now()
	parsed.GeneratedAt = now.Format(time.RFC3339)
	parsed.CachedFor = int(recommendationTTL.Seconds())

	// Persiste no banco para sobreviver reboots
	actionsJSON, _ := json.Marshal(parsed.Actions)
	_, _ = h.db.ExecContext(r.Context(), `
		INSERT INTO recommendation_cache (id, headline, reason, actions, generated_at, cached_at)
		VALUES (1, $1, $2, $3, $4, $4)
		ON CONFLICT (id) DO UPDATE SET
			headline = EXCLUDED.headline,
			reason = EXCLUDED.reason,
			actions = EXCLUDED.actions,
			generated_at = EXCLUDED.generated_at,
			cached_at = EXCLUDED.cached_at`,
		parsed.Headline, parsed.Reason, actionsJSON, now)

	h.recoMu.Lock()
	h.recoCache = &parsed
	h.recoCachedAt = now
	h.recoMu.Unlock()

	// Notifica grupo configurado em Settings — só quando regenerou (este path
	// é cache miss ou force=1). Dedup curto pra cobrir refresh acidental.
	if h.notif != nil {
		dedupKey := "dashboard-recommendation"
		if force {
			dedupKey += ":force"
		}
		body := "📌 " + parsed.Headline
		if parsed.Reason != "" {
			body += "\n" + parsed.Reason
		}
		if len(parsed.Actions) > 0 {
			body += "\nAções:"
			for i, a := range parsed.Actions {
				if i >= 3 {
					break
				}
				body += "\n• " + a
			}
		}
		h.notif.Notify(notifier.KindJonfreyRecommend, body, dedupKey, 30*time.Minute)
	}

	writeJSON(w, http.StatusOK, parsed)
}

func (h *DashboardHandler) collectOperationalSnapshot(ctx context.Context) string {
	var lines []string

	// Inbox
	var inboxCount int
	_ = h.db.GetContext(ctx, &inboxCount, `SELECT COUNT(*) FROM catalogproduct WHERE curation_status IN ('pending','incomplete')`)
	lines = append(lines, fmt.Sprintf("- inbox de curadoria: %d itens pendentes/incompletos", inboxCount))

	// Produtos sem categoria primária (match/catalogo ruim até corrigir)
	var noPrimaryTax int
	_ = h.db.GetContext(ctx, &noPrimaryTax, `
		SELECT COUNT(*) FROM catalogproduct cp
		WHERE NOT EXISTS (
		  SELECT 1 FROM catalogproduct_taxonomy cpt
		  WHERE cpt.product_id = cp.id AND cpt.role = 'primary_category'
		)`)
	if noPrimaryTax > 0 {
		lines = append(lines, fmt.Sprintf("- produtos sem categoria primária (taxonomia): %d", noPrimaryTax))
	}

	// Taxonomia pendente de revisão
	var taxPending int
	_ = h.db.GetContext(ctx, &taxPending, `SELECT COUNT(*) FROM taxonomy WHERE status = 'pending'`)
	lines = append(lines, fmt.Sprintf("- entradas de taxonomia pendentes: %d", taxPending))

	// Disparos últimas 24h
	var dispatches24h int
	_ = h.db.GetContext(ctx, &dispatches24h, `SELECT COUNT(*) FROM dispatches WHERE created_at > now() - interval '24 hours'`)
	lines = append(lines, fmt.Sprintf("- disparos nas últimas 24h: %d", dispatches24h))

	// Dispatches em fila (queued/pending = a enviar; pending_approval = aguardando aprovação)
	var dispatchesQueued, dispatchesPendingApproval int
	_ = h.db.GetContext(ctx, &dispatchesQueued, `SELECT COUNT(*) FROM dispatches WHERE status IN ('queued','pending')`)
	_ = h.db.GetContext(ctx, &dispatchesPendingApproval, `SELECT COUNT(*) FROM dispatches WHERE status = 'pending_approval'`)
	lines = append(lines, fmt.Sprintf("- disparos em fila (a enviar): %d", dispatchesQueued))
	if dispatchesPendingApproval > 0 {
		lines = append(lines, fmt.Sprintf("- disparos aguardando aprovação manual: %d", dispatchesPendingApproval))
	}

	var fullAuto bool
	_ = h.db.GetContext(ctx, &fullAuto, `SELECT full_auto_mode FROM appconfig WHERE id = 1`)
	lines = append(lines, fmt.Sprintf("- full_auto_mode (auto-libera pending_approval): %t", fullAuto))

	// Agendados no futuro
	var dispatchesScheduled int
	_ = h.db.GetContext(ctx, &dispatchesScheduled, `
		SELECT COUNT(*) FROM dispatches WHERE status = 'scheduled' AND scheduled_for > now()`)
	lines = append(lines, fmt.Sprintf("- disparos agendados (futuro): %d", dispatchesScheduled))

	// Targets presos em pending (>1h pode indicar congestão WA/TG)
	var targetsStale int
	_ = h.db.GetContext(ctx, &targetsStale, `
		SELECT COUNT(*) FROM dispatch_targets
		WHERE status = 'pending' AND created_at < now() - interval '1 hour'`)
	if targetsStale > 0 {
		lines = append(lines, fmt.Sprintf("- targets em pending há >1h (possível fila congestionada): %d", targetsStale))
	}

	// Crawlers ativos — tabela: searchterm (sem underscore)
	var crawlersActive int
	_ = h.db.GetContext(ctx, &crawlersActive, `SELECT COUNT(*) FROM searchterm WHERE active = true`)
	lines = append(lines, fmt.Sprintf("- crawlers ativos: %d", crawlersActive))

	// Logs de auto-match (volume ≈ uso do matcher)
	var autoMatchLogs7d int
	_ = h.db.GetContext(ctx, &autoMatchLogs7d, `SELECT COUNT(*) FROM auto_match_logs WHERE created_at > now() - interval '7 days'`)
	lines = append(lines, fmt.Sprintf("- auto_match_logs últimos 7d: %d", autoMatchLogs7d))

	var fpMatch30d int64
	_ = h.db.GetContext(ctx, &fpMatch30d, `
		SELECT COUNT(*) FROM auto_match_logs WHERE false_positive = true AND created_at > now() - interval '30 days'`)
	if fpMatch30d > 0 {
		lines = append(lines, fmt.Sprintf("- falsos positivos de match (30d): %d", fpMatch30d))
	}

	// Produtos auditados
	var inspected, uninspected int
	_ = h.db.GetContext(ctx, &inspected, `SELECT COUNT(*) FROM catalogproduct WHERE inspected = true`)
	_ = h.db.GetContext(ctx, &uninspected, `SELECT COUNT(*) FROM catalogproduct WHERE inspected = false OR inspected IS NULL`)
	lines = append(lines, fmt.Sprintf("- produtos auditados: %d / a auditar: %d", inspected, uninspected))

	// Canais ativos — tabela: channel (sem s)
	var channelsActive int
	_ = h.db.GetContext(ctx, &channelsActive, `SELECT COUNT(*) FROM channel WHERE active = true`)
	lines = append(lines, fmt.Sprintf("- canais ativos: %d", channelsActive))

	var llmErr24h int
	_ = h.db.GetContext(ctx, &llmErr24h, `SELECT COUNT(*) FROM llm_metrics WHERE error = true AND created_at > now() - interval '24 hours'`)
	if llmErr24h > 0 {
		lines = append(lines, fmt.Sprintf("- erros LLM (24h, telemetria): %d", llmErr24h))
	}

	// Última ação Jonfrey (contexto pra “operar piloto automático”)
	type jfLast struct {
		ActionType string    `db:"action_type"`
		Status     string    `db:"status"`
		CreatedAt  time.Time `db:"created_at"`
	}
	var jf jfLast
	if err := h.db.GetContext(ctx, &jf, `
		SELECT action_type, status, created_at FROM jonfrey_actions ORDER BY id DESC LIMIT 1`); err == nil && jf.ActionType != "" {
		lines = append(lines, fmt.Sprintf("- último Jonfrey: %s (%s) em %s",
			jf.ActionType, jf.Status, jf.CreatedAt.Format(time.RFC3339)))
	}

	if oc, err := h.store.GetOperationalContext(ctx); err == nil {
		lines = append(lines, "")
		lines = append(lines, "CONTEXTO CRUZADO (canais ↔ crawlers ↔ cobertura do catálogo):")
		lines = append(lines, strings.TrimSpace(store.FormatOperationalContextBlock(oc)))
	}

	return strings.Join(lines, "\n")
}

// titleJonfreyAction formata um action_type (snake_case) para título legível no inbox.
func titleJonfreyAction(at string) string {
	if at == "" {
		return at
	}
	parts := strings.Split(strings.ReplaceAll(at, "_", " "), " ")
	for i, p := range parts {
		if len(p) == 0 {
			continue
		}
		low := strings.ToLower(p)
		parts[i] = strings.ToUpper(low[:1]) + low[1:]
	}
	return strings.Join(parts, " ")
}

// extractJSON tenta extrair o JSON de uma resposta do LLM (remove possível ```json envelope).
func extractJSON(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```")
		if i := strings.LastIndex(s, "```"); i >= 0 {
			s = s[:i]
		}
		s = strings.TrimSpace(s)
	}
	// Pega tudo entre primeira { e última }
	first := strings.Index(s, "{")
	last := strings.LastIndex(s, "}")
	if first >= 0 && last > first {
		return s[first : last+1]
	}
	return s
}
