package handlers

import (
	"fmt"
	"net/http"
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

// GET /api/dashboard/kpis?period=24h|7d|30d
func (h *DashboardHandler) KPIs(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "24h"
	}

	var since time.Time
	switch period {
	case "7d":
		since = time.Now().Add(-7 * 24 * time.Hour)
	case "30d":
		since = time.Now().Add(-30 * 24 * time.Hour)
	default:
		since = time.Now().Add(-24 * time.Hour)
	}

	var kpis struct {
		ClicksTotal int     `db:"clicks_total"`
		Revenue     float64 `db:"revenue_total"`
	}

	_ = h.db.GetContext(r.Context(), &kpis,
		`SELECT COALESCE(SUM(click_count),0) as clicks_total,
		        COALESCE(SUM(revenue),0) as revenue_total
		 FROM dispatch_targets
		 WHERE created_at >= $1`, since)

	var total, completed int
	_ = h.db.GetContext(r.Context(), &total,
		`SELECT COUNT(*) FROM dispatches WHERE created_at >= $1`, since)
	_ = h.db.GetContext(r.Context(), &completed,
		`SELECT COUNT(*) FROM dispatches WHERE status='completed' AND created_at >= $1`, since)

	convPct := 0.0
	if total > 0 {
		convPct = float64(completed) / float64(total) * 100
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"dispatches_24h": total,
		"clicks_24h":     kpis.ClicksTotal,
		"revenue_24h":    kpis.Revenue,
		"conversion_pct": convPct,
		"period":         period,
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
//	@Description  Retorna lista de alertas críticos/avisos para ação imediata.
//	@Tags         dashboard
//	@Produce      json
//	@Success      200  {array}   object
//	@Router       /api/dashboard/inbox [get]
func (h *DashboardHandler) Inbox(w http.ResponseWriter, r *http.Request) {
	type Alert struct {
		ID        string `json:"id"`
		Type      string `json:"type"`      // "critical" | "warning" | "info"
		Title     string `json:"title"`
		Subtitle  string `json:"subtitle"`
		Action    string `json:"action"`    // label do botão
		ActionURL string `json:"action_url"`
	}

	var alerts []Alert

	// Contas WA desconectadas
	accounts, _ := h.store.ListWAAccounts()
	for _, a := range accounts {
		if a.Status == "disconnected" || a.Status == "banned" {
			alertType := "warning"
			if a.Status == "banned" {
				alertType = "critical"
			}
			alerts = append(alerts, Alert{
				ID:        fmt.Sprintf("wa-%d", a.ID),
				Type:      alertType,
				Title:     fmt.Sprintf("Conta WhatsApp %q %s", a.Name, a.Status),
				Subtitle:  "sem atividade",
				Action:    "Reconectar via QR",
				ActionURL: "/accounts",
			})
		}
	}

	// Crawlers com erro
	terms, _ := h.store.ListSearchTerms()
	for _, t := range terms {
		if t.Active && t.LastCrawledAt.Valid && t.ResultCount == 0 {
			alerts = append(alerts, Alert{
				ID:        fmt.Sprintf("crawler-%d", t.ID),
				Type:      "warning",
				Title:     fmt.Sprintf("Crawler %q sem resultados", t.Query),
				Subtitle:  "última execução sem produtos",
				Action:    "Ver detalhes",
				ActionURL: "/crawlers",
			})
		}
	}

	if alerts == nil {
		alerts = []Alert{}
	}
	writeJSON(w, http.StatusOK, alerts)
}

// Performance retorna tabela de performance por canal nos últimos 7 dias.
//
//	@Summary      Dashboard performance
//	@Description  Retorna tabela de performance por canal (7 dias).
//	@Tags         dashboard
//	@Produce      json
//	@Success      200  {array}   object
//	@Router       /api/dashboard/performance [get]
func (h *DashboardHandler) Performance(w http.ResponseWriter, r *http.Request) {
	type ChannelPerf struct {
		ChannelID   int64   `db:"channel_id"   json:"channel_id"`
		ChannelName string  `db:"channel_name" json:"channel_name"`
		Dispatches  int     `db:"dispatches_7d" json:"dispatches_7d"`
		CTR         float64 `db:"ctr_7d"       json:"ctr_7d"`
	}

	var rows []ChannelPerf
	_ = h.db.SelectContext(r.Context(), &rows, `
		SELECT c.id as channel_id, c.name as channel_name,
		       COUNT(DISTINCT dt.id) as dispatches_7d,
		       0.0 as ctr_7d
		FROM channels c
		LEFT JOIN groups g ON g.channel_id = c.id
		LEFT JOIN dispatch_targets dt ON dt.group_id = g.id
		    AND dt.delivered_at > now() - interval '7 days'
		WHERE c.active = true
		GROUP BY c.id, c.name
		ORDER BY dispatches_7d DESC
		LIMIT 5
	`)

	if rows == nil {
		rows = []ChannelPerf{}
	}
	writeJSON(w, http.StatusOK, rows)
}
