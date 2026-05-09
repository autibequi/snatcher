package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

// openAIModelsListingURL devolve a URL GET compatível com OpenAI (/v1/models).
// Aceita base já terminada em /v1 (Snatcher normaliza assim para provider "ollama").
func openAIModelsListingURL(baseURL string) string {
	b := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(b, "/v1") {
		return b + "/models"
	}
	return b + "/v1/models"
}

// ollamaNativeTagsURL é o endpoint nativo Ollama /api/tags (remove sufixo /v1 se existir).
func ollamaNativeTagsURL(baseURL string) string {
	b := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	b = strings.TrimSuffix(b, "/v1")
	return b + "/api/tags"
}

type LLMAdminHandler struct {
	db *sqlx.DB
}

func NewLLMAdminHandler(db *sqlx.DB) *LLMAdminHandler {
	return &LLMAdminHandler{db: db}
}

type opUsage struct {
	Operation       string    `db:"operation" json:"operation"`
	DailyUSDLimit   float64   `db:"daily_usd_limit" json:"budget_daily_usd"`
	DailySpentUSD   float64   `db:"daily_spent_usd" json:"cost_usd_today"`
	RateLimitPerMin int       `db:"rate_limit_per_minute" json:"rate_limit_per_minute"`
	Enabled         bool      `db:"enabled" json:"enabled"`
	LastResetAt     time.Time `db:"last_reset_at" json:"last_reset_at"`
	BudgetRemaining float64   `json:"budget_remaining_usd"`
	Requests        int64     `json:"requests_24h"`
	CacheHits       int64     `json:"cache_hits_24h"`
	CacheHitRatio   float64   `json:"cache_hit_ratio"`
	CostUSD         float64   `json:"cost_usd"`
	AvgLatencyMs    int64     `json:"avg_latency_ms"`
	Errors24h       int64     `json:"errors_24h"`
}

// GET /api/admin/llm/usage?period=24h|7d
//
//	@Summary      LLM usage statistics per operation
//	@Description  Retorna uso de LLM por operação, incluindo requisições, custos e budgets.
//	@Tags         admin
//	@Produce      json
//	@Param        period  query    string  false  "Period (24h|7d, default 24h)"
//	@Success      200     {object}  object{period=string,operations=[]object{}}
//	@Failure      500     {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/admin/llm/usage [get]
func (h *LLMAdminHandler) Usage(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "24h"
	}

	var hoursBack int
	switch period {
	case "24h":
		hoursBack = 24
	case "7d":
		hoursBack = 24 * 7
	default:
		hoursBack = 24
	}

	var budgets []opUsage
	err := h.db.SelectContext(r.Context(), &budgets,
		`SELECT
			b.operation,
			b.daily_usd_limit,
			b.daily_spent_usd,
			b.rate_limit_per_minute,
			b.enabled,
			b.last_reset_at,
			COALESCE(COUNT(DISTINCT CASE WHEN m.created_at > now() - interval '1 day' THEN m.id END), 0) as requests_24h,
			COALESCE(SUM(CASE WHEN m.cache_hit = true AND m.created_at > now() - interval '1 day' THEN 1 ELSE 0 END), 0) as cache_hits_24h,
			COALESCE(SUM(m.estimated_cost_usd), 0) as cost_usd,
			COALESCE(EXTRACT(EPOCH FROM AVG(m.latency_seconds)) * 1000, 0)::bigint as avg_latency_ms,
			COALESCE(SUM(CASE WHEN m.error = true AND m.created_at > now() - interval '1 day' THEN 1 ELSE 0 END), 0) as errors_24h
		FROM llm_op_budgets b
		LEFT JOIN llm_metrics m ON b.operation = m.operation AND m.created_at > now() - interval $1
		GROUP BY b.operation, b.daily_usd_limit, b.daily_spent_usd, b.rate_limit_per_minute, b.enabled, b.last_reset_at
		ORDER BY b.operation`,
		hoursBack,
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao consultar budgets LLM: "+err.Error())
		return
	}

	for i := range budgets {
		remaining := budgets[i].DailyUSDLimit - budgets[i].DailySpentUSD
		if remaining < 0 {
			remaining = 0
		}
		budgets[i].BudgetRemaining = remaining

		// Calcular cache hit ratio
		total := budgets[i].Requests
		if total > 0 {
			budgets[i].CacheHitRatio = float64(budgets[i].CacheHits) / float64(total)
		} else {
			budgets[i].CacheHitRatio = 0
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"period":     period,
		"operations": budgets,
	})
}

// GET /api/admin/llm/ollama/models e …/vllm/models (mesmo handler)
// Lista modelos: primeiro OpenAI-compatível GET …/v1/models (vLLM, Ollama com /v1, LM Studio),
// senão fallback para API nativa Ollama GET …/api/tags.
func (h *LLMAdminHandler) OllamaModels(w http.ResponseWriter, r *http.Request) {
	baseURL := normalizeLLMBaseURL(r.URL.Query().Get("base_url"))
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	upAuth := strings.TrimSpace(r.Header.Get("X-Snatcher-Upstream-Authorization"))

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	type modelOut struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
	}

	openAIURL := openAIModelsListingURL(baseURL)
	reqOA, err := http.NewRequestWithContext(ctx, http.MethodGet, openAIURL, nil)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "URL inválida: "+err.Error())
		return
	}
	if upAuth != "" {
		reqOA.Header.Set("Authorization", upAuth)
	}
	respOA, err := http.DefaultClient.Do(reqOA)
	if err != nil {
		hint := ""
		if strings.Contains(baseURL, "vllm") || strings.Contains(strings.ToLower(err.Error()), "lookup") || strings.Contains(strings.ToLower(err.Error()), "no such host") {
			hint = " Rede Docker: o hostname (ex. vllm) só funciona se este backend partilhar rede com o vLLM; senão usa IP:porta do host em vez de vllm."
		}
		writeErr(w, http.StatusBadGateway, "falha ao conectar ("+baseURL+"): "+err.Error()+"."+hint)
		return
	}
	defer respOA.Body.Close()

	openAIOK := false
	if respOA.StatusCode == http.StatusOK {
		var raw struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if err := json.NewDecoder(respOA.Body).Decode(&raw); err == nil {
			out := make([]modelOut, 0, len(raw.Data))
			for _, m := range raw.Data {
				if m.ID != "" {
					out = append(out, modelOut{Name: m.ID, Size: 0})
				}
			}
			writeJSON(w, http.StatusOK, out)
			openAIOK = true
		}
	}
	if openAIOK {
		return
	}

	tagsURL := ollamaNativeTagsURL(baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, tagsURL, nil)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "URL inválida (fallback): "+err.Error())
		return
	}
	if upAuth != "" {
		req.Header.Set("Authorization", upAuth)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("compat OpenAI (%s) não OK e falha no Ollama nativo (%s): %v", openAIURL, tagsURL, err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		writeErr(w, http.StatusBadGateway, fmt.Sprintf("OpenAI-compat (%s) e Ollama nativo (%s) retornaram erro (último status HTTP %d)", openAIURL, tagsURL, resp.StatusCode))
		return
	}

	var raw struct {
		Models []struct {
			Name       string `json:"name"`
			Size       int64  `json:"size"`
			ModifiedAt string `json:"modified_at"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		writeErr(w, http.StatusBadGateway, "resposta inválida do Ollama /api/tags: "+err.Error())
		return
	}

	out := make([]modelOut, 0, len(raw.Models))
	for _, m := range raw.Models {
		out = append(out, modelOut{Name: m.Name, Size: m.Size})
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /api/admin/llm/logs?limit=100&errors_only=true
// Retorna últimos N execs de LLM (com filtro opcional de só erros).
func (h *LLMAdminHandler) Logs(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		// best-effort parse
		var n int
		_, _ = fmt.Sscanf(v, "%d", &n)
		if n > 0 && n <= 500 {
			limit = n
		}
	}
	errorsOnly := r.URL.Query().Get("errors_only") == "true"

	type logRow struct {
		ID         int64     `db:"id" json:"id"`
		Operation  string    `db:"operation" json:"operation"`
		Model      string    `db:"model" json:"model"`
		Status     string    `db:"status" json:"status"`
		TokensIn   int       `db:"tokens_in" json:"tokens_in"`
		TokensOut  int       `db:"tokens_out" json:"tokens_out"`
		CostUSD    float64   `db:"estimated_cost_usd" json:"cost_usd"`
		CacheHit   bool      `db:"cache_hit" json:"cache_hit"`
		Error      bool      `db:"error" json:"error"`
		ErrorMsg   *string   `db:"error_msg" json:"error_msg,omitempty"`
		LatencyS   *float64  `db:"latency_seconds" json:"latency_seconds,omitempty"`
		Prompt     *string   `db:"prompt" json:"prompt,omitempty"`
		Response   *string   `db:"response" json:"response,omitempty"`
		CreatedAt  time.Time `db:"created_at" json:"created_at"`
	}

	q := `SELECT id, operation, model, status, tokens_in, tokens_out,
	             estimated_cost_usd, cache_hit, error, error_msg,
	             latency_seconds, prompt, response, created_at
	      FROM llm_metrics`
	if errorsOnly {
		q += ` WHERE error = true`
	}
	q += ` ORDER BY created_at DESC LIMIT $1`

	var rows []logRow
	if err := h.db.SelectContext(r.Context(), &rows, q, limit); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao consultar logs LLM: "+err.Error())
		return
	}
	if rows == nil {
		rows = []logRow{}
	}
	writeJSON(w, http.StatusOK, rows)
}

// GET /api/admin/llm/cost-series?days=14
// Agrega custo estimado (USD) e contagem por dia em UTC nos últimos N dias (bucket diário inclui hoje).
func (h *LLMAdminHandler) CostSeries(w http.ResponseWriter, r *http.Request) {
	days := 14
	if v := r.URL.Query().Get("days"); v != "" {
		var n int
		_, _ = fmt.Sscanf(v, "%d", &n)
		if n > 0 {
			days = n
		}
	}
	if days < 1 {
		days = 1
	}
	if days > 90 {
		days = 90
	}

	nowUTC := time.Now().UTC()
	endExclusive := time.Date(nowUTC.Year(), nowUTC.Month(), nowUTC.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1)
	startInclusive := endExclusive.AddDate(0, 0, -days)

	type aggRow struct {
		Bucket   time.Time `db:"bucket"`
		CostUsd  float64   `db:"cost_usd"`
		Requests int64     `db:"requests"`
	}

	q := `
		SELECT date_trunc('day', timezone('utc', created_at)) AS bucket,
		       COALESCE(SUM(estimated_cost_usd), 0)::float8 AS cost_usd,
		       COUNT(*)::bigint AS requests
		FROM llm_metrics
		WHERE created_at >= $1 AND created_at < $2
		GROUP BY 1
		ORDER BY 1 ASC
	`

	var agg []aggRow
	if err := h.db.SelectContext(r.Context(), &agg, q, startInclusive, endExclusive); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao consultar série de custo LLM: "+err.Error())
		return
	}

	utcDayKey := func(t time.Time) string {
		t = t.UTC()
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	}

	byDay := make(map[string]aggRow, len(agg))
	for _, row := range agg {
		byDay[utcDayKey(row.Bucket)] = row
	}

	type seriesPoint struct {
		Bucket   time.Time `json:"bucket"`
		CostUSD  float64   `json:"cost_usd"`
		Requests int64     `json:"requests"`
	}
	out := make([]seriesPoint, 0, days)
	for d := startInclusive; d.Before(endExclusive); d = d.AddDate(0, 0, 1) {
		k := utcDayKey(d)
		row, ok := byDay[k]
		b := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
		if ok {
			out = append(out, seriesPoint{Bucket: b, CostUSD: row.CostUsd, Requests: row.Requests})
		} else {
			out = append(out, seriesPoint{Bucket: b, CostUSD: 0, Requests: 0})
		}
	}

	writeJSON(w, http.StatusOK, out)
}

// PATCH /api/admin/llm/budgets/:op
//
//	@Summary      Update LLM operation budget
//	@Description  Atualiza budget diário e limites de rate para uma operação específica.
//	@Tags         admin
//	@Accept       json
//	@Produce      json
//	@Param        op   path     string  true   "Operation name (compose, parse_offer, etc)"
//	@Param        body body     object{daily_usd_limit=number,rate_limit_per_minute=integer,enabled=boolean}  true  "Budget update"
//	@Success      200  {object}  object{status=string}
//	@Failure      400  {object}  object{error=string}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/admin/llm/budgets/{op} [patch]
func (h *LLMAdminHandler) UpdateBudget(w http.ResponseWriter, r *http.Request) {
	op := r.PathValue("op")
	if op == "" {
		writeErr(w, http.StatusBadRequest, "operacao obrigatoria")
		return
	}

	var req struct {
		DailyUSDLimit   *float64 `json:"daily_usd_limit"`
		RateLimitPerMin *int     `json:"rate_limit_per_minute"`
		Enabled         *bool    `json:"enabled"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "body invalido")
		return
	}

	// Validar operation existe
	var count int
	err := h.db.GetContext(r.Context(), &count,
		`SELECT COUNT(*) FROM llm_op_budgets WHERE operation = $1`, op)
	if err != nil || count == 0 {
		writeErr(w, http.StatusBadRequest, "operacao nao encontrada")
		return
	}

	// Atualizar campos fornecidos
	if req.DailyUSDLimit != nil {
		if _, err := h.db.ExecContext(r.Context(),
			`UPDATE llm_op_budgets SET daily_usd_limit = $1 WHERE operation = $2`,
			*req.DailyUSDLimit, op); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar daily_usd_limit")
			return
		}
	}

	if req.RateLimitPerMin != nil {
		if _, err := h.db.ExecContext(r.Context(),
			`UPDATE llm_op_budgets SET rate_limit_per_minute = $1 WHERE operation = $2`,
			*req.RateLimitPerMin, op); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar rate_limit_per_minute")
			return
		}
	}

	if req.Enabled != nil {
		if _, err := h.db.ExecContext(r.Context(),
			`UPDATE llm_op_budgets SET enabled = $1 WHERE operation = $2`,
			*req.Enabled, op); err != nil {
			writeErr(w, http.StatusInternalServerError, "erro ao atualizar enabled")
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// GET /api/admin/llm/budgets
//
//	@Summary      List all LLM operation budgets
//	@Description  Retorna configuração atual de budgets e rate limits para todas as operações.
//	@Tags         admin
//	@Produce      json
//	@Success      200  {object}  object{budgets=[]object{}}
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/admin/llm/budgets [get]
func (h *LLMAdminHandler) ListBudgets(w http.ResponseWriter, r *http.Request) {
	type budgetInfo struct {
		Operation       string    `db:"operation" json:"operation"`
		DailyUSDLimit   float64   `db:"daily_usd_limit" json:"daily_usd_limit"`
		DailySpentUSD   float64   `db:"daily_spent_usd" json:"daily_spent_usd"`
		RateLimitPerMin int       `db:"rate_limit_per_minute" json:"rate_limit_per_minute"`
		Enabled         bool      `db:"enabled" json:"enabled"`
		LastResetAt     time.Time `db:"last_reset_at" json:"last_reset_at"`
	}

	var budgets []budgetInfo
	err := h.db.SelectContext(r.Context(), &budgets,
		`SELECT operation, daily_usd_limit, daily_spent_usd, rate_limit_per_minute, enabled, last_reset_at
		 FROM llm_op_budgets
		 ORDER BY operation`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar budgets: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"budgets": budgets,
	})
}

// POST /api/admin/llm/budgets/:op/reset
//
//	@Summary      Reset daily budget counter for operation
//	@Description  Reseta o contador de gasto diário de uma operação (daily_spent_usd = 0).
//	@Tags         admin
//	@Produce      json
//	@Param        op  path     string  true   "Operation name"
//	@Success      200 {object}  object{status=string}
//	@Failure      400 {object}  object{error=string}
//	@Failure      500 {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/admin/llm/budgets/{op}/reset [post]
func (h *LLMAdminHandler) ResetBudget(w http.ResponseWriter, r *http.Request) {
	op := r.PathValue("op")
	if op == "" {
		writeErr(w, http.StatusBadRequest, "operacao obrigatoria")
		return
	}

	result, err := h.db.ExecContext(r.Context(),
		`UPDATE llm_op_budgets SET daily_spent_usd = 0, last_reset_at = now() WHERE operation = $1`,
		op)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao resetar budget: "+err.Error())
		return
	}

	rows, err := result.RowsAffected()
	if err != nil || rows == 0 {
		writeErr(w, http.StatusBadRequest, "operacao nao encontrada")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}
