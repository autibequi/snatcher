package observability

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
	"github.com/prometheus/client_golang/prometheus"
)

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

// LLM metrics (populated via internal/llm/telemetry.go recordUsage)
var (
	// LLMRequests counts LLM API call attempts.
	LLMRequests = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_llm_requests_total",
			Help: "Total number of LLM API requests.",
		},
		[]string{"model", "task", "outcome"},
	)

	// LLMTokensUsed counts tokens consumed by LLM calls.
	LLMTokensUsed = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_llm_tokens_used_total",
			Help: "Total number of LLM tokens used.",
		},
		[]string{"model", "direction"},
	)

	// LLMCostUSD tracks estimated cost in USD for LLM calls.
	LLMCostUSD = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_llm_cost_usd_total",
			Help: "Estimated total cost in USD of LLM API calls.",
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
		DispatchSendDurationSeconds,
		CircuitBreakerState,
		LLMCostUSDToday,
		DispatchTotal,
		BanTotal,
		QueueDepth,
		LLMClassificationPendingReview,
		CanonicalDeduplicationRate,
	)
}

// Dispatch metrics (low-cardinality: status only).
var (
	// DispatchSendDurationSeconds tracks how long each dispatch send attempt takes.
	// Label "status" carries values like "ok", "error", "timeout" — never channel_id (use OTel for that).
	DispatchSendDurationSeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "snatcher_dispatch_send_duration_seconds",
			Help:    "Duration of dispatch send attempts (low-cardinality: status only).",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"status"},
	)
)

// Circuit-breaker metrics (low-cardinality: upstream + state).
var (
	// CircuitBreakerState tracks the current state of each upstream circuit breaker.
	// Label "upstream" identifies the external service (e.g. "whatsapp", "telegram").
	// Label "state" carries "open", "half-open", "closed".
	CircuitBreakerState = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "snatcher_circuit_breaker_state",
			Help: "Current state of circuit breakers per upstream (0=closed, 1=half-open, 2=open).",
		},
		[]string{"upstream", "state"},
	)
)

// Cost metrics snapshot (low-cardinality: provider only).
var (
	// LLMCostUSDToday tracks the accumulated LLM spend for the current calendar day per provider.
	// Resets at midnight (managed externally by the daily metrics job).
	LLMCostUSDToday = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "snatcher_llm_cost_usd_today",
			Help: "Estimated LLM cost in USD accumulated today per provider (resets at midnight).",
		},
		[]string{"provider"},
	)
)

// Dispatch totals (low-cardinality: status only — never channel_id).
var (
	// DispatchTotal counts dispatch send attempts by final status.
	// Label "status" carries values like "ok", "error", "timeout".
	// For per-channel drill-down use the OTel DispatchSendPerChannel counter.
	DispatchTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_dispatch_total",
			Help: "Total dispatch send attempts (low-cardinality: status only).",
		},
		[]string{"status"},
	)
)

// Ban metrics (low-cardinality: type only).
var (
	// BanTotal counts ban events by type (e.g. "ip", "account", "device").
	BanTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "snatcher_ban_total",
			Help: "Total ban events by type.",
		},
		[]string{"type"},
	)
)

// Queue depth metrics (low-cardinality: queue name).
var (
	// QueueDepth tracks the current number of items pending in each named queue.
	// Label "queue" carries logical queue names (e.g. "send", "classify", "retry").
	QueueDepth = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "snatcher_queue_depth",
			Help: "Current number of items pending in each queue.",
		},
		[]string{"queue"},
	)
)

// Canonical dedup metrics (W2.C).
var (
	// CanonicalDeduplicationRate tracks the deduplication rate of the last canonical backfill batch.
	// Value is a percentage (0.0–100.0) representing how many processed rows reused an existing canonical.
	CanonicalDeduplicationRate = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "canonical_products_dedup_rate",
			Help: "Deduplication rate of the last canonical backfill batch (percentage of rows that reused an existing canonical).",
		},
	)
)

// LLM classification review queue metrics (ADR-014 mitigação W-1).
var (
	// LLMClassificationPendingReview reflects how many LLM-classified items are
	// awaiting human review per classification_type ('brand' | 'category').
	// Updated by UpdateLLMPendingReview; used as a proxy health signal while the
	// full correction loop (W3+W5) is not yet available.
	LLMClassificationPendingReview = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "llm_classification_pending_review",
			Help: "Number of LLM-classified items awaiting human review, by classification_type.",
		},
		[]string{"classification_type"},
	)
)

// UpdateLLMPendingReview queries the llm_classification_pending_review table and
// refreshes the LLMClassificationPendingReview gauge.
// Intended to be called periodically (e.g. by the scheduler or a cron job).
func UpdateLLMPendingReview(ctx context.Context, db *sqlx.DB) {
	rows, err := db.QueryContext(ctx, `
		SELECT classification_type, count(*)
		FROM llm_classification_pending_review
		WHERE status = 'pending'
		GROUP BY classification_type
	`)
	if err != nil {
		slog.Error("metrics: query llm_classification_pending_review", "err", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var classificationType string
		var count float64
		if err := rows.Scan(&classificationType, &count); err != nil {
			slog.Error("metrics: scan llm_classification_pending_review", "err", err)
			return
		}
		LLMClassificationPendingReview.WithLabelValues(classificationType).Set(count)
	}

	if err := rows.Err(); err != nil {
		slog.Error("metrics: rows error llm_classification_pending_review", "err", err)
	}
}
