package llm

import (
	"context"
	"sync"

	"github.com/jmoiron/sqlx"
)

var (
	metricsDB   *sqlx.DB
	metricsDBMu sync.RWMutex
)

// SetMetricsDB injeta o DB usado para persistir execs em llm_metrics.
// Chamado uma vez no startup (router.Build).
func SetMetricsDB(db *sqlx.DB) {
	metricsDBMu.Lock()
	metricsDB = db
	metricsDBMu.Unlock()
}

func getMetricsDB() *sqlx.DB {
	metricsDBMu.RLock()
	defer metricsDBMu.RUnlock()
	return metricsDB
}

const maxPayloadStoreLen = 8000 // protege contra bloat — trunca prompts/responses muito longos

func truncatePayload(s string) string {
	if len(s) <= maxPayloadStoreLen {
		return s
	}
	return s[:maxPayloadStoreLen] + "... [truncated]"
}

// RecordHandlerError loga falhas que acontecem no handler após o LLM ter respondido
// (ex: parse JSON falhou no consumidor). Útil pra rastrear todas as falhas no log unificado.
func RecordHandlerError(operation, model, errMsg, payload string) {
	recordMetric("", operation, model, "handler_parse_error", 0, 0, 0, 0, true, errMsg, "", payload)
}

// recordMetric insere um exec do LLM na tabela llm_metrics. No-op se DB não setado.
// provider: "openrouter" | "vllm" | "ollama", ou vazio (ex.: erro de handler sem contexto de rede).
func recordMetric(provider, operation, model, status string, tokIn, tokOut int, costUSD float64, latencySeconds float64, isError bool, errMsg, prompt, response string) {
	db := getMetricsDB()
	if db == nil {
		return
	}
	if operation == "" {
		operation = "unknown"
	}
	if model == "" {
		model = "unknown"
	}
	var errMsgPtr *string
	if errMsg != "" {
		errMsgPtr = &errMsg
	}
	_, _ = db.ExecContext(context.Background(), `
		INSERT INTO llm_metrics
		  (provider, operation, model, status, tokens_in, tokens_out, estimated_cost_usd, cache_hit, error, error_msg, latency_seconds, prompt, response, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, now())`,
		provider, operation, model, status, tokIn, tokOut, costUSD, isError, errMsgPtr, latencySeconds,
		truncatePayload(prompt), truncatePayload(response))
}
