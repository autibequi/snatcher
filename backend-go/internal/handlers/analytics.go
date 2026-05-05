package handlers

import (
	"net/http"
	"snatcher/backendv2/internal/store"
	"strconv"
	"time"
)

type AnalyticsHandler struct {
	store store.Store
}

func NewAnalytics(st store.Store) *AnalyticsHandler {
	return &AnalyticsHandler{store: st}
}

// Summary retorna o resumo analítico do período.
//
//	@Summary      Resumo analítico
//	@Description  Retorna métricas consolidadas de scraping, produtos e alertas para o período.
//	@Tags         analytics
//	@Produce      json
//	@Param        days  query     int  false  "Número de dias (1-365, default 30)"
//	@Success      200   {object}  object{}
//	@Failure      500   {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/analytics/summary [get]
func (h *AnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days <= 0 || days > 365 {
		days = 30
	}
	since := time.Now().UTC().AddDate(0, 0, -days)

	summary, err := h.store.GetAnalyticsSummary(since, days)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summary)
}
