package llm

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	llmRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_op_requests_total",
		Help: "Total LLM requests per operation",
	}, []string{"operation", "model", "status"})

	llmTokensUsed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_op_tokens",
		Help: "LLM tokens consumed per operation",
	}, []string{"operation", "model", "kind"})

	llmCostUSD = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_op_cost_usd",
		Help: "Estimated LLM cost in USD per operation",
	}, []string{"operation", "model"})

	llmCacheHitsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_cache_hits_total",
		Help: "LLM cache hit/miss count",
	}, []string{"operation", "result"})

	llmLatencySeconds = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name: "llm_op_latency_seconds",
		Help: "LLM operation latency in seconds",
		Buckets: []float64{0.1, 0.5, 1.0, 2.0, 5.0, 10.0},
	}, []string{"operation"})

	llmBudgetRemaining = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "llm_op_budget_remaining_usd",
		Help: "Remaining budget per LLM operation in USD",
	}, []string{"operation"})
)

// custo estimado por token (USD)
var tokenCost = map[string][2]float64{
	"openai/gpt-4o-mini":          {0.00000015, 0.0000006},
	"anthropic/claude-3.5-sonnet": {0.000003, 0.000015},
	"openai/o1-mini":              {0.000003, 0.000012},
}

func recordUsage(operation, model string, tokIn, tokOut int) {
	llmRequestsTotal.WithLabelValues(operation, model, "ok").Inc()
	llmTokensUsed.WithLabelValues(operation, model, "in").Add(float64(tokIn))
	llmTokensUsed.WithLabelValues(operation, model, "out").Add(float64(tokOut))

	costs := tokenCost[model]
	cost := float64(tokIn)*costs[0] + float64(tokOut)*costs[1]
	if cost > 0 {
		llmCostUSD.WithLabelValues(operation, model).Add(cost)
	}
}

func recordCacheHit(operation, result string) {
	llmCacheHitsTotal.WithLabelValues(operation, result).Inc()
}

// RecordLatency registra latência de uma operação LLM em segundos
func RecordLatency(operation string, durationSeconds float64) {
	llmLatencySeconds.WithLabelValues(operation).Observe(durationSeconds)
}

// RecordBudgetRemaining atualiza a métrica de budget restante para uma operação
func RecordBudgetRemaining(operation string, remaining float64) {
	llmBudgetRemaining.WithLabelValues(operation).Set(remaining)
}
