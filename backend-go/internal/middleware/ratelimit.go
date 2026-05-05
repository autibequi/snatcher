package middleware

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ipEntry holds the rate limiter and the last access time for a given IP.
type ipEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// ipCache is a simple per-IP cache backed by sync.Map.
// Entries that have not been accessed in ttl duration are pruned lazily.
type ipCache struct {
	mu  sync.Mutex
	m   sync.Map
	rps float64
	b   int
	ttl time.Duration
}

func newIPCache(rps float64, burst int, ttl time.Duration) *ipCache {
	c := &ipCache{rps: rps, b: burst, ttl: ttl}
	// Background cleanup goroutine: prune stale entries every ttl/2.
	go c.cleanup()
	return c
}

func (c *ipCache) get(ip string) *rate.Limiter {
	now := time.Now()
	if v, ok := c.m.Load(ip); ok {
		entry := v.(*ipEntry)
		c.mu.Lock()
		entry.lastSeen = now
		c.mu.Unlock()
		return entry.limiter
	}
	entry := &ipEntry{
		limiter:  rate.NewLimiter(rate.Limit(c.rps), c.b),
		lastSeen: now,
	}
	c.m.Store(ip, entry)
	return entry.limiter
}

func (c *ipCache) cleanup() {
	interval := c.ttl / 2
	if interval < time.Minute {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-c.ttl)
		c.m.Range(func(k, v any) bool {
			entry := v.(*ipEntry)
			c.mu.Lock()
			stale := entry.lastSeen.Before(cutoff)
			c.mu.Unlock()
			if stale {
				c.m.Delete(k)
			}
			return true
		})
	}
}

// realIP extracts the client IP from the request, respecting X-Forwarded-For
// and X-Real-IP headers (trustworthy behind a reverse proxy).
func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For may contain multiple IPs; take the first (client).
		if idx := strings.Index(xff, ","); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	// Strip port from RemoteAddr.
	addr := r.RemoteAddr
	if i := strings.LastIndex(addr, ":"); i != -1 {
		return addr[:i]
	}
	return addr
}

// RateLimit returns a middleware that limits requests per IP.
//
//	rps   — sustained request rate (requests per second, e.g. 5.0/60.0 for 5/min)
//	burst — maximum burst size
func RateLimit(rps float64, burst int) func(http.Handler) http.Handler {
	cache := newIPCache(rps, burst, time.Hour)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := realIP(r)
			limiter := cache.get(ip)
			if !limiter.Allow() {
				// Calculate approximate seconds until next token is available.
				retryAfter := int(math.Ceil(1.0 / rps))
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", http.StatusText(retryAfter))
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error":       "rate_limit_exceeded",
					"retry_after": retryAfter,
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
