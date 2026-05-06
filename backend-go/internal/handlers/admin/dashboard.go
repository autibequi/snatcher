package admin

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"snatcher/backendv2/internal/store"

	"github.com/jmoiron/sqlx"
)

type DashboardHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewDashboardHandler(st store.Store, db *sqlx.DB) *DashboardHandler {
	return &DashboardHandler{store: st, db: db}
}

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

	// Health score baseado em wa_accounts.
	// Heurística: (active - banned*2 - disconnected) / total * 100, clamp [0,100].
	// Penalidade adicional: grupos ativos com admin_count < 2 reduzem o score (peso pequeno).
	// Se sem contas → null.
	accounts, err := h.store.ListWAAccounts()
	var healthScore *int
	accountsNormalCount := 0
	if err == nil && len(accounts) > 0 {
		total := len(accounts)
		active, banned, disconnected := 0, 0, 0
		for _, a := range accounts {
			switch a.Status {
			case "active", "connected":
				active++
				accountsNormalCount++
			case "banned":
				banned++
			case "disconnected":
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

	// Categoria: wa_disconnect — contas WA desconectadas ou banidas
	accounts, _ := h.store.ListWAAccounts()
	for _, a := range accounts {
		if a.Status == "disconnected" || a.Status == "banned" {
			severity := "atencao"
			if a.Status == "banned" {
				severity = "critico"
			}
			alerts = append(alerts, Alert{
				ID:       fmt.Sprintf("wa-%d", a.ID),
				Severity: severity,
				Category: "wa_disconnect",
				Title:    fmt.Sprintf("Conta WhatsApp %q %s", a.Name, a.Status),
				Subtitle: "sem atividade",
				CTA:      CTA{Label: "Reconectar via QR", Href: "/accounts"},
			})
		}
	}

	// Categoria: crawler_fail — crawlers ativos sem resultados
	terms, _ := h.store.ListSearchTerms()
	for _, t := range terms {
		if t.Active && t.LastCrawledAt.Valid && t.ResultCount == 0 {
			alerts = append(alerts, Alert{
				ID:       fmt.Sprintf("crawler-%d", t.ID),
				Severity: "atencao",
				Category: "crawler_fail",
				Title:    fmt.Sprintf("Crawler %q sem resultados", t.Query),
				Subtitle: "última execução sem produtos",
				CTA:      CTA{Label: "Ver detalhes", Href: "/crawlers"},
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
		FROM channels c
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
		ID         string  `json:"id"`
		Name       string  `json:"name"`
		Subtitle   string  `json:"subtitle"`
		ETASeconds int     `json:"eta_seconds"`
		Kind       string  `json:"kind"` // "group" | "digest"
	}

	// dispatches tabela usa scheduled_for (não scheduled_at).
	// status='scheduled' indica disparos futuros pendentes.
	// kind: derivado de composed_by — se contém "digest" → "digest", caso contrário "group".
	type rawRow struct {
		ID           int64   `db:"id"`
		ComposedBy   string  `db:"composed_by"`
		ETASeconds   int     `db:"eta_seconds"`
	}

	var raws []rawRow
	err := h.db.SelectContext(r.Context(), &raws, `
		SELECT id,
		       COALESCE(composed_by, '') as composed_by,
		       EXTRACT(EPOCH FROM (scheduled_for - now()))::int as eta_seconds
		FROM dispatches
		WHERE status = 'scheduled'
		  AND scheduled_for > now()
		ORDER BY scheduled_for ASC
		LIMIT $1
	`, limit)

	if err != nil || len(raws) == 0 {
		writeJSON(w, http.StatusOK, []UpcomingItem{})
		return
	}

	items := make([]UpcomingItem, 0, len(raws))
	for _, raw := range raws {
		kind := "group"
		if raw.ComposedBy == "digest" {
			kind = "digest"
		}
		items = append(items, UpcomingItem{
			ID:         fmt.Sprintf("%d", raw.ID),
			Name:       fmt.Sprintf("Disparo #%d", raw.ID),
			Subtitle:   "",
			ETASeconds: raw.ETASeconds,
			Kind:       kind,
		})
	}

	writeJSON(w, http.StatusOK, items)
}
