package redirect

import (
	"fmt"
	"net/http"
	"snatcher/backendv2/internal/store"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/jmoiron/sqlx"
)

const (
	productTTL = 1 * time.Hour
	// ProductRedirectCacheMaxAge — TTL para Cache-Control / CDN-Cache-Control em redirects de produto (/r/, /v/).
	ProductRedirectCacheMaxAge = 7 * 24 * 3600 // 7 dias
)

type productEntry struct {
	redirectURL string
	expiresAt   time.Time
}

type Redirector struct {
	db    *sqlx.DB
	store store.Store
	cache sync.Map
	fraud *FraudFilter
}

func New(db *sqlx.DB, st store.Store) *Redirector {
	return &Redirector{db: db, store: st, fraud: NewFraudFilter()}
}

// SetProductRedirectCacheHeaders — TTL alinhado à CDN (ex.: Cloudflare respeita CDN-Cache-Control na edge).
// Nota: cache de redirect na edge reduz round-trips ao origin e pode afetar contagens de clique se a CDN servir a resposta em cache.
func SetProductRedirectCacheHeaders(h http.Header) {
	v := fmt.Sprintf("public, max-age=%d", ProductRedirectCacheMaxAge)
	h.Set("Cache-Control", v)
	h.Set("CDN-Cache-Control", v)
}

func (rd *Redirector) Prewarm() {
	// Prewarm carrega apenas short_links — tabela product removida em F07.
	// (sem pré-carga de short_links por ora: entradas são cacheadas on-demand em resolve)
}

func (rd *Redirector) Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		shortID := r.PathValue("shortID")
		if !validShortID(shortID) {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}

		dest, ok := rd.resolve(shortID)
		if !ok {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}

		// Log assíncrono — não bloqueia o 301
		go rd.logClick(r, shortID)

		// Com GTM configurado: HTML estático (Tag Assistant + dataLayer) + redirect via JS;
		// sem GTM: 301 com cache de edge (comportamento anterior).
		if WriteHTMLRedirectWithGTM(w, GTMContainerID(rd.store), dest) {
			return
		}

		h := w.Header()
		SetProductRedirectCacheHeaders(h)
		h.Set("Location", dest)
		w.WriteHeader(http.StatusMovedPermanently)
	}
}

func (rd *Redirector) resolve(shortID string) (string, bool) {
	if v, ok := rd.cache.Load(shortID); ok {
		e := v.(productEntry)
		if time.Now().Before(e.expiresAt) {
			return e.redirectURL, true
		}
		rd.cache.Delete(shortID)
	}

	// Canônico: tabela short_links — dest_url já inclui afiliado (BuildLink antes do insert).
	if destURL, _, ok := rd.store.PeekShortLinkByID(shortID); ok {
		rd.cache.Store(shortID, productEntry{
			redirectURL: destURL,
			expiresAt:   time.Now().Add(productTTL),
		})
		return destURL, true
	}

	return "", false
}

func (rd *Redirector) logClick(r *http.Request, shortID string) {
	// Fraud filter: recusa bots e IPs em rate-limit antes de gravar qualquer click.
	if rd.fraud != nil && !rd.fraud.Allow(r) {
		return
	}

	ip := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = strings.SplitN(xff, ",", 2)[0]
	}
	ua := r.UserAgent()

	// Extrai host do Request para domain_host (clicks table)
	domainHost := r.Host
	if domainHost == "" {
		domainHost = "unknown"
	}

	if _, _, ok := rd.store.PeekShortLinkByID(shortID); !ok {
		return
	}

	rd.store.IncrementShortLinkClickCount(shortID)

	// Resolve catalog_id e group_id via send_log v2 (pipeline canônico — F07).
	// Usa o envio mais recente associado a este short_id via catalog.short_id.
	var logCtx struct {
		CatalogID *int64 `db:"catalog_id"`
		GroupID   *int64 `db:"group_id"`
	}
	_ = rd.db.Get(&logCtx, `
		SELECT sl.catalog_id, sl.group_id
		FROM send_log sl
		JOIN catalog c ON c.id = sl.catalog_id
		WHERE c.short_id = $1
		ORDER BY sl.sent_at DESC
		LIMIT 1`, shortID)

	// Grava em clicks (tabela canônica v2).
	_, _ = rd.db.Exec(`
		INSERT INTO clicks (short_id, catalog_id, domain_host, group_id, user_agent, ip)
		VALUES ($1, $2, $3, $4, $5, $6::inet)`,
		shortID, logCtx.CatalogID, domainHost, logCtx.GroupID, ua, ip)
}

// EnqueueClickLog grava click de forma assíncrona (clicks v2 + IncrementShortLinkClickCount).
func (rd *Redirector) EnqueueClickLog(r *http.Request, shortID string) {
	go rd.logClick(r, shortID)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func validShortID(s string) bool {
	if len(s) < 4 || len(s) > 16 {
		return false
	}
	for _, c := range s {
		if !unicode.IsLetter(c) && !unicode.IsDigit(c) {
			return false
		}
	}
	return true
}
