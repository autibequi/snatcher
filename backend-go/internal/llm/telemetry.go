package llm

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	llmRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_requests_total",
		Help: "Total LLM requests",
	}, []string{"operation", "model", "status"})

	llmTokensUsed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_tokens_used",
		Help: "LLM tokens consumed",
	}, []string{"operation", "model", "kind"})

	llmCostUSD = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_cost_usd",
		Help: "Estimated LLM cost in USD",
	}, []string{"operation", "model"})

	llmCacheHitsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_cache_hits_total",
		Help: "LLM cache hit/miss count",
	}, []string{"operation", "result"})
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
