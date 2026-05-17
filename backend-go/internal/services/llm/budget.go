package llm

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

var ErrBudgetExceeded = errors.New("llm: daily budget exceeded for operation")
var ErrOperationDisabled = errors.New("llm: operation is disabled")
var ErrRateLimited = errors.New("llm: rate limit exceeded for operation")

// BudgetGuard checks and updates budget per operation, with in-memory rate limiter.
type BudgetGuard struct {
	db          *sqlx.DB
	rateLimitMu sync.Mutex
	rateLimits  map[string]*leakyBucket // in-memory rate limiter per operation
}

// leakyBucket is a simple token bucket for rate limiting.
type leakyBucket struct {
	tokens      float64
	capacity    float64
	refillRate  float64 // tokens per second
	lastRefill  time.Time
}

func NewBudgetGuard(db *sqlx.DB) *BudgetGuard {
	return &BudgetGuard{
		db:         db,
		rateLimits: make(map[string]*leakyBucket),
	}
}

type opBudget struct {
	DailyUSDLimit  float64 `db:"daily_usd_limit"`
	DailySpentUSD  float64 `db:"daily_spent_usd"`
	RateLimitMin   int     `db:"rate_limit_per_minute"`
	Enabled        bool    `db:"enabled"`
}

// Check verifies if the operation can proceed (budget, rate limit, and enabled state).
func (g *BudgetGuard) Check(ctx context.Context, op string) error {
	var b opBudget
	err := g.db.GetContext(ctx, &b,
		`SELECT daily_usd_limit, daily_spent_usd, rate_limit_per_minute, enabled
		 FROM llm_op_budgets WHERE operation = $1`, op)
	if err != nil {
		return nil // operation not registered → allow
	}
	if !b.Enabled {
		return ErrOperationDisabled
	}
	if b.DailyUSDLimit > 0 && b.DailySpentUSD >= b.DailyUSDLimit {
		return fmt.Errorf("%w: %s (spent %.4f / %.4f USD)", ErrBudgetExceeded, op, b.DailySpentUSD, b.DailyUSDLimit)
	}

	// Check rate limit
	if err := g.checkRateLimit(op, b.RateLimitMin); err != nil {
		return err
	}

	return nil
}

// checkRateLimit checks if the operation has tokens available in its leaky bucket.
func (g *BudgetGuard) checkRateLimit(op string, limitPerMin int) error {
	g.rateLimitMu.Lock()
	defer g.rateLimitMu.Unlock()

	bucket := g.rateLimits[op]
	if bucket == nil {
		// Initialize bucket on first use
		refillRate := float64(limitPerMin) / 60.0 // tokens per second
		bucket = &leakyBucket{
			tokens:     float64(limitPerMin), // start with full capacity
			capacity:   float64(limitPerMin),
			refillRate: refillRate,
			lastRefill: time.Now(),
		}
		g.rateLimits[op] = bucket
	}

	// Refill tokens based on elapsed time
	now := time.Now()
	elapsed := now.Sub(bucket.lastRefill).Seconds()
	bucket.tokens = min(bucket.capacity, bucket.tokens+elapsed*bucket.refillRate)
	bucket.lastRefill = now

	if bucket.tokens >= 1.0 {
		bucket.tokens -= 1.0
		return nil
	}

	return fmt.Errorf("%w: %s (rate %d req/min)", ErrRateLimited, op, limitPerMin)
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// Charge adds cost to the operation (transactional UPDATE, emits metric).
func (g *BudgetGuard) Charge(ctx context.Context, op string, costUSD float64) error {
	_, err := g.db.ExecContext(ctx,
		`UPDATE llm_op_budgets SET daily_spent_usd = daily_spent_usd + $1 WHERE operation = $2`,
		costUSD, op)
	// Metric llm_op_cost_usd already emitted by recordUsage() in openrouter.go
	return err
}

// ResetAll zeros daily_spent_usd on all operations (daily job, runs at 00:00 UTC).
func (g *BudgetGuard) ResetAll(ctx context.Context) error {
	_, err := g.db.ExecContext(ctx,
		`UPDATE llm_op_budgets SET daily_spent_usd = 0, last_reset_at = now()`)
	return err
}

// SecondsUntilReset returns seconds until the next daily reset (00:00 UTC).
func SecondsUntilReset() int {
	now := time.Now().UTC()
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	return int(midnight.Sub(now).Seconds())
}

// opClient wraps a Client to add budget checks and charging.
type opClient struct {
	op    string
	inner Client
	guard *BudgetGuard
}

// WithOperation returns a Client that checks and charges budget for a given operation.
func WithOperation(op string, c Client, g *BudgetGuard) Client {
	if g == nil {
		return c
	}
	return &opClient{op: op, inner: c, guard: g}
}

func (c *opClient) Complete(ctx context.Context, prompt string, opts Options) (string, error) {
	if err := c.guard.Check(ctx, c.op); err != nil {
		return "", err
	}

	// Injeta CallUsage no contexto para que o provider preencha os tokens reais.
	// Se o provider não suportar (ex: NopClient), tokens ficam em zero e usamos estimativa.
	ctxWithUsage, usage := WithCallUsage(ctx)

	resp, err := c.inner.Complete(ctxWithUsage, prompt, opts)
	if err == nil && c.op != "" {
		// Usa tokens reais quando disponíveis; fallback para estimativa com 0/100.
		tokIn := usage.TokensIn
		tokOut := usage.TokensOut
		if tokIn == 0 && tokOut == 0 {
			tokOut = 100 // estimativa conservadora para providers que não reportam tokens
		}
		_ = c.guard.Charge(ctx, c.op, estimateCost(opts.Model, tokIn, tokOut))
	}
	return resp, err
}

// estimateCost calcula o custo estimado em USD com base no modelo e tokens consumidos.
// Preços por 1M tokens (in/out) de acordo com OpenRouter pricing (referência 2026-05).
func estimateCost(model string, tokIn, tokOut int) float64 {
	// Mapa de custo por token (USD por token, não por 1M) para modelos conhecidos.
	// Fonte: https://openrouter.ai/models (verificado 2026-05-17).
	costs := map[string][2]float64{
		"openai/gpt-4o-mini":                    {0.00000015, 0.0000006},   // $0.15/$0.60 per 1M
		"anthropic/claude-3.5-sonnet":            {0.000003, 0.000015},     // $3/$15 per 1M
		"mistral/mistral-7b-instruct":            {0.00000007, 0.00000007}, // $0.07/$0.07 per 1M
		"meta-llama/llama-3.1-8b-instruct":       {0.00000005, 0.00000005}, // $0.05/$0.05 per 1M
		"google/gemini-flash-1.5":                {0.000000075, 0.0000003}, // $0.075/$0.30 per 1M
	}
	c := costs[model]
	if c[0] == 0 {
		c = costs["openai/gpt-4o-mini"] // fallback para modelo barato conhecido
	}
	return float64(tokIn)*c[0] + float64(tokOut)*c[1]
}
