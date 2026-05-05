package observability

import "github.com/prometheus/client_golang/prometheus"

// HTTP metrics
var (
	// HTTPRequestDuration tracks latency of HTTP requests.
	HTTPRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Duration of HTTP requests in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path", "status"},
	)

	// HTTPRequestsTotal counts total HTTP requests.
	HTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests.",
		},
		[]string{"method", "path", "status"},
	)
)

// Scraper metrics
var (
	// ScraperRuns counts scraper run attempts.
	ScraperRuns = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_scraper_runs_total",
			Help: "Total number of scraper run attempts.",
		},
		[]string{"source", "outcome"},
	)

	// ScraperResults tracks the number of results returned by each scraper.
	ScraperResults = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "snatcher_scraper_results_count",
			Help: "Number of results returned by the last scraper run.",
		},
		[]string{"source"},
	)
)

// Channel metrics
var (
	// ChannelSends counts channel send attempts.
	ChannelSends = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_channel_sends_total",
			Help: "Total number of channel send attempts.",
		},
		[]string{"provider", "outcome"},
	)
)

// Job / scheduler metrics
var (
	// JobRuns counts scheduler job run attempts.
	JobRuns = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_job_runs_total",
			Help: "Total number of scheduled job run attempts.",
		},
		[]string{"job_name", "outcome"},
	)
)

// Database metrics
var (
	// DBQueryDuration tracks duration of database queries.
	DBQueryDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "snatcher_db_query_duration_seconds",
			Help:    "Duration of database queries in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"query"},
	)
)

// LLM metrics (placeholder — populated in Fase 1)
var (
	// LLMRequests counts LLM API call attempts.
	LLMRequests = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_llm_requests_total",
			Help: "Total number of LLM API requests (placeholder, populated in Fase 1).",
		},
		[]string{"model", "task", "outcome"},
	)

	// LLMTokensUsed counts tokens consumed by LLM calls.
	LLMTokensUsed = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_llm_tokens_used_total",
			Help: "Total number of LLM tokens used (placeholder, populated in Fase 1).",
		},
		[]string{"model", "direction"},
	)

	// LLMCostUSD tracks estimated cost in USD for LLM calls.
	LLMCostUSD = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_llm_cost_usd_total",
			Help: "Estimated total cost in USD of LLM API calls (placeholder, populated in Fase 1).",
		},
		[]string{"model", "task"},
	)
)

// MustRegisterAll registers all custom metrics with the default Prometheus
// registry. Call once at server startup.
func MustRegisterAll() {
	prometheus.MustRegister(
		HTTPRequestDuration,
		HTTPRequestsTotal,
		ScraperRuns,
		ScraperResults,
		ChannelSends,
		JobRuns,
		DBQueryDuration,
		LLMRequests,
		LLMTokensUsed,
		LLMCostUSD,
	)
}
