package admin

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jmoiron/sqlx"
)

// HealthResponse agrega o estado atual de todos os subsistemas do Snatcher.
type HealthResponse struct {
	Dispatcher     map[string]interface{} `json:"dispatcher"`
	CircuitBreaker map[string]string      `json:"circuit_breaker"`
	LLM            map[string]interface{} `json:"llm"`
	Catalog        map[string]int         `json:"catalog"`
}

// SystemHealthHandler retorna um snapshot de saúde do sistema:
// fila pendente, workers ativos, estados dos circuit breakers, custo LLM hoje
// e distribuição de catalog_status.
//
// GET /api/admin/health
func SystemHealthHandler(db *sqlx.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp := buildHealthResponse(db, r.Context())
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// buildHealthResponse coleta todos os indicadores de saúde e retorna o struct populado.
func buildHealthResponse(db *sqlx.DB, ctx context.Context) HealthResponse {
	resp := HealthResponse{
		Dispatcher:     map[string]interface{}{},
		CircuitBreaker: map[string]string{},
		LLM:            map[string]interface{}{},
		Catalog:        map[string]int{},
	}

	fillDispatcherInfo(db, ctx, resp.Dispatcher)
	fillCircuitBreakerInfo(db, ctx, resp.CircuitBreaker)
	fillLLMInfo(db, ctx, resp.LLM)
	fillCatalogInfo(db, ctx, resp.Catalog)

	return resp
}

// fillDispatcherInfo preenche queue_depth e active_workers no mapa recebido.
func fillDispatcherInfo(db *sqlx.DB, ctx context.Context, dest map[string]interface{}) {
	// queue_depth: mensagens pendentes aguardando envio
	var queueDepth int
	_ = db.GetContext(ctx, &queueDepth, `
		SELECT COUNT(*)
		FROM send_queue
		WHERE status = 'pending'
	`)
	dest["queue_depth"] = queueDepth

	// active_workers: workers com lease ativo (ainda processando)
	var activeWorkers int
	_ = db.GetContext(ctx, &activeWorkers, `
		SELECT COUNT(DISTINCT worker_id)
		FROM send_queue
		WHERE status = 'sending'
		  AND lease_expires_at > now()
	`)
	dest["active_workers"] = activeWorkers
}

// circuitBreakerRow mapeia uma linha de circuit_breaker_state.
type circuitBreakerRow struct {
	Upstream string `db:"upstream"`
	State    string `db:"state"`
}

// fillCircuitBreakerInfo preenche o estado (open/closed/half-open) de cada upstream.
func fillCircuitBreakerInfo(db *sqlx.DB, ctx context.Context, dest map[string]string) {
	var rows []circuitBreakerRow
	_ = db.SelectContext(ctx, &rows, `
		SELECT upstream, state::text AS state
		FROM circuit_breaker_state
	`)
	for _, row := range rows {
		dest[row.Upstream] = row.State
	}
}

// fillLLMInfo preenche o custo acumulado em USD dos modelos LLM no dia atual.
func fillLLMInfo(db *sqlx.DB, ctx context.Context, dest map[string]interface{}) {
	var costToday float64
	_ = db.GetContext(ctx, &costToday, `
		SELECT COALESCE(SUM(cost_usd), 0)
		FROM llm_metrics
		WHERE created_at::date = current_date
	`)
	dest["cost_today_usd_total"] = costToday
}

// catalogStatusRow mapeia uma linha do GROUP BY em catalog.
type catalogStatusRow struct {
	Status string `db:"status"`
	Count  int    `db:"n"`
}

// fillCatalogInfo preenche a distribuição de catalog_status (quantos itens em cada estado).
func fillCatalogInfo(db *sqlx.DB, ctx context.Context, dest map[string]int) {
	var rows []catalogStatusRow
	_ = db.SelectContext(ctx, &rows, `
		SELECT COALESCE(catalog_status::text, 'null') AS status, COUNT(*) AS n
		FROM catalog
		GROUP BY catalog_status
	`)
	for _, row := range rows {
		dest[row.Status] = row.Count
	}
}
