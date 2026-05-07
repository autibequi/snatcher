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

// recordMetric insere um exec do LLM na tabela llm_metrics. No-op se DB não setado.
func recordMetric(operation, model, status string, tokIn, tokOut int, costUSD float64, latencySeconds float64, isError bool, errMsg, prompt, response string) {
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
		  (operation, model, status, tokens_in, tokens_out, estimated_cost_usd, cache_hit, error, error_msg, latency_seconds, prompt, response, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, $11, now())`,
		operation, model, status, tokIn, tokOut, costUSD, isError, errMsgPtr, latencySeconds,
		truncatePayload(prompt), truncatePayload(response))
}
