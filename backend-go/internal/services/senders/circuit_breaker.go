package senders

import (
	"context"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

type breakerState string

const (
	BrkClosed   breakerState = "closed"
	BrkOpen     breakerState = "open"
	BrkHalfOpen breakerState = "half_open"
)

const (
	BreakerFailureThreshold = 5
	BreakerOpenCooldown     = 30 * time.Second
)

type Breaker struct {
	mu       sync.Mutex
	upstream string
	state    breakerState
	failures int
	openedAt time.Time
	db       *sqlx.DB
}

func NewBreaker(db *sqlx.DB, upstream string) *Breaker {
	return &Breaker{db: db, upstream: upstream, state: BrkClosed}
}

// Allow retorna true se chamada permitida. Atualiza state se transitando half-open.
func (b *Breaker) Allow(ctx context.Context) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state == BrkOpen && time.Since(b.openedAt) > BreakerOpenCooldown {
		b.state = BrkHalfOpen
		b.persistState(ctx)
	}
	return b.state == BrkClosed || b.state == BrkHalfOpen
}

func (b *Breaker) RecordSuccess(ctx context.Context) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures = 0
	b.state = BrkClosed
	b.persistState(ctx)
}

func (b *Breaker) RecordFailure(ctx context.Context) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures++
	if b.failures >= BreakerFailureThreshold {
		b.state = BrkOpen
		b.openedAt = time.Now()
	}
	b.persistState(ctx)
}

func (b *Breaker) persistState(ctx context.Context) {
	_, _ = b.db.ExecContext(ctx, `
        UPDATE circuit_breaker_state
        SET state=$1, failure_count=$2, opened_at=$3
        WHERE upstream=$4`,
		string(b.state), b.failures, b.openedAt, b.upstream)
}
