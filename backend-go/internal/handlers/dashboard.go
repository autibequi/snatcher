package handlers

import (
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
