package redirect

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// FraudFilter — checa rate limit por IP e UA blacklist antes de logar click.
type FraudFilter struct {
	mu      sync.Mutex
	ipHits  map[string][]time.Time // IP → últimos timestamps
	uaBlock []string
}

// NewFraudFilter cria um FraudFilter com defaults razoáveis.
func NewFraudFilter() *FraudFilter {
	return &FraudFilter{
		ipHits: make(map[string][]time.Time),
		uaBlock: []string{
			"Googlebot", "Bingbot", "Yahoo! Slurp", "DuckDuckBot",
			"facebookexternalhit", "Twitterbot",
			"curl/", "wget/", "python-requests",
		},
	}
}

// Allow retorna false se o click parece fraudulento:
// - UA vazio ou de bot conhecido
// - Mesmo IP com mais de 5 clicks nos últimos 10min
func (f *FraudFilter) Allow(req *http.Request) bool {
	ua := req.UserAgent()
	for _, b := range f.uaBlock {
		if strings.Contains(ua, b) {
			return false
		}
	}
	if ua == "" {
		return false
	}

	ip := req.Header.Get("X-Forwarded-For")
	if ip == "" {
		ip = req.RemoteAddr
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-10 * time.Minute)
	hits := f.ipHits[ip]
	fresh := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			fresh = append(fresh, t)
		}
	}
	fresh = append(fresh, now)
	f.ipHits[ip] = fresh
	return len(fresh) <= 5
}
