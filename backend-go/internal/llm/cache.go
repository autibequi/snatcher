package llm

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
)

type DBCache struct {
	db *sqlx.DB
}

func NewDBCache(db *sqlx.DB) *DBCache {
	return &DBCache{db: db}
}

func cacheKey(model, prompt string) string {
	h := sha256.Sum256([]byte(model + "|" + prompt))
	return fmt.Sprintf("%x", h)
}

func (c *DBCache) Get(ctx context.Context, model, prompt string) (string, bool, error) {
	key := cacheKey(model, prompt)
	var resp string
	err := c.db.GetContext(ctx, &resp,
		`SELECT response FROM llm_cache WHERE cache_key = $1 AND expires_at > now()`, key)
	if err != nil {
		return "", false, nil // miss
	}
	return resp, true, nil
}

func (c *DBCache) Set(ctx context.Context, model, prompt, response string, ttl time.Duration, op string, tokIn, tokOut int, costUSD float64) error {
	key := cacheKey(model, prompt)
	_, err := c.db.ExecContext(ctx, `
        INSERT INTO llm_cache (cache_key, model, response, operation, tokens_in, tokens_out, cost_usd, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now() + $8::interval)
        ON CONFLICT (cache_key) DO UPDATE
          SET response=EXCLUDED.response, expires_at=EXCLUDED.expires_at`,
		key, model, response, op, tokIn, tokOut, costUSD, fmt.Sprintf("%d seconds", int(ttl.Seconds())))
	return err
}

// CachedClient é um Client que faz lookup no cache antes de chamar o LLM.
type CachedClient struct {
	inner  Client
	cache  *DBCache
	router *ModelRouter
	ttl    time.Duration
}

func NewCachedClient(inner Client, cache *DBCache, router *ModelRouter) *CachedClient {
	return &CachedClient{inner: inner, cache: cache, router: router, ttl: 24 * time.Hour}
}

func (c *CachedClient) Complete(ctx context.Context, prompt string, opts Options) (string, error) {
	opts = c.router.Route(opts.Operation, opts)

	if c.cache != nil {
		if resp, hit, _ := c.cache.Get(ctx, opts.Model, prompt); hit {
			recordCacheHit(opts.Operation, "hit")
			return resp, nil
		}
		recordCacheHit(opts.Operation, "miss")
	}

	resp, err := c.inner.Complete(ctx, prompt, opts)
	if err != nil {
		return "", err
	}

	if c.cache != nil {
		_ = c.cache.Set(ctx, opts.Model, prompt, resp, c.ttl, opts.Operation, 0, 0, 0)
	}
	return resp, nil
}
