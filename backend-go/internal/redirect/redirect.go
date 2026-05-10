package redirect

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/url"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/jmoiron/sqlx"
)

const (
	productTTL = 1 * time.Hour
	configTTL  = 5 * time.Minute
)

type productEntry struct {
	redirectURL string
	expiresAt   time.Time
}

type configEntry struct {
	affiliates map[string]string // source_id -> tracking_id
	validAt    time.Time
}

type Redirector struct {
	db    *sqlx.DB
	store store.Store
	cache sync.Map
	cfgMu sync.RWMutex
	cfgV  configEntry
}

func New(db *sqlx.DB, st store.Store) *Redirector {
	return &Redirector{db: db, store: st}
}

func (rd *Redirector) Prewarm() {
	affiliates, err := rd.store.ListAffiliates(nil)
	if err != nil {
		return
	}

	affMap := make(map[string]string)
	for _, a := range affiliates {
		if a.Active {
			affMap[a.SourceID] = a.TrackingID
		}
	}

	rows, err := rd.db.Query(
		`SELECT short_id, url, source FROM product WHERE short_id IS NOT NULL AND short_id != ''`,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	expires := time.Now().Add(productTTL)
	n := 0
	for rows.Next() {
		var shortID, rawURL, source string
		if err := rows.Scan(&shortID, &rawURL, &source); err != nil {
			continue
		}

		var amzTag, mlToolID string
		if source == "amazon" {
			amzTag = affMap["amz"]
		} else if source == "mercadolivre" {
			mlToolID = affMap["ml"]
		}

		rd.cache.Store(shortID, productEntry{
			redirectURL: affiliateURL(rawURL, source, amzTag, mlToolID),
			expiresAt:   expires,
		})
		n++
	}
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

		h := w.Header()
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
		h.Set("CDN-Cache-Control", "public, max-age=31536000")
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

	amzTag, mlToolID := rd.getConfig()

	// Novo sistema: tabela short_links — dest_url já inclui afiliado (BuildLink antes do insert).
	if destURL, _, ok := rd.store.PeekShortLinkByID(shortID); ok {
		rd.cache.Store(shortID, productEntry{
			redirectURL: destURL,
			expiresAt:   time.Now().Add(productTTL),
		})
		return destURL, true
	}

	// Legado: tabela product
	p, found, err := rd.store.GetProductByShortID(shortID)
	if err != nil || !found {
		return "", false
	}

	dest := affiliateURL(p.URL, p.Source, amzTag, mlToolID)
	rd.cache.Store(shortID, productEntry{
		redirectURL: dest,
		expiresAt:   time.Now().Add(productTTL),
	})
	return dest, true
}

func (rd *Redirector) getConfig() (amzTag, mlToolID string) {
	rd.cfgMu.RLock()
	if time.Now().Before(rd.cfgV.validAt) {
		a, m := rd.cfgV.affiliates["amz"], rd.cfgV.affiliates["ml"]
		rd.cfgMu.RUnlock()
		return a, m
	}
	rd.cfgMu.RUnlock()

	rd.cfgMu.Lock()
	defer rd.cfgMu.Unlock()

	if time.Now().Before(rd.cfgV.validAt) {
		return rd.cfgV.affiliates["amz"], rd.cfgV.affiliates["ml"]
	}

	affiliates, err := rd.store.ListAffiliates(nil)
	if err == nil && len(affiliates) > 0 {
		aff := make(map[string]string)
		for _, a := range affiliates {
			if a.Active {
				aff[a.SourceID] = a.TrackingID
			}
		}
		rd.cfgV = configEntry{
			affiliates: aff,
			validAt:    time.Now().Add(configTTL),
		}
	}
	return rd.cfgV.affiliates["amz"], rd.cfgV.affiliates["ml"]
}

func (rd *Redirector) logClick(r *http.Request, shortID string) {
	ip := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = strings.SplitN(xff, ",", 2)[0]
	}
	ipHash := fmt.Sprintf("%x", sha256.Sum256([]byte(ip)))[:16]
	ua := r.UserAgent()
	ref := r.Referer()

	// 1) Tenta legado: tabela product → clicklog (com FK product_id)
	if p, found, err := rd.store.GetProductByShortID(shortID); err == nil && found {
		_ = rd.store.InsertClickLog(models.ClickLog{
			ProductID: p.ID,
			IPHash:    ipHash,
			UserAgent: ua,
			Referrer:  ref,
		})
		return
	}

	// 2) Sistema novo: short_links → registra em shortlink_clicks com produto/canal/dispatch resolvidos
	if destURL, source, ok := rd.store.PeekShortLinkByID(shortID); ok {
		// Resolve último dispatch que usou este short_id no affiliate_link, pega product_id+channel_id
		// Útil para clusterização e analytics por canal/produto.
		var ctx struct {
			ProductID  *int64 `db:"product_id"`
			ChannelID  *int64 `db:"channel_id"`
			DispatchID *int64 `db:"dispatch_id"`
		}
		_ = rd.db.Get(&ctx, `
			SELECT d.product_id, aml.channel_id, d.id AS dispatch_id
			FROM dispatches d
			LEFT JOIN auto_match_logs aml ON aml.dispatch_id = d.id
			WHERE d.affiliate_link LIKE '%/v/' || $1
			ORDER BY d.created_at DESC
			LIMIT 1`, shortID)

		_, _ = rd.db.Exec(`
			INSERT INTO shortlink_clicks (short_id, source, dest_url, product_id, channel_id, dispatch_id, ip_hash, user_agent, referrer)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			shortID, source, destURL, ctx.ProductID, ctx.ChannelID, ctx.DispatchID, ipHash, ua, ref)
		rd.store.IncrementShortLinkClickCount(shortID)
	}
}

// EnqueueClickLog grava clicklog ou shortlink_clicks de forma assíncrona (um incremento em short_links por evento).
func (rd *Redirector) EnqueueClickLog(r *http.Request, shortID string) {
	go rd.logClick(r, shortID)
}

// ---------------------------------------------------------------------------
// Helpers (extraídos do redirect/main.go)
// ---------------------------------------------------------------------------

func affiliateURL(rawURL, source, amzTag, mlToolID string) string {
	switch source {
	case "amazon":
		if amzTag == "" {
			return rawURL
		}
		u, err := url.Parse(rawURL)
		if err != nil {
			return rawURL
		}
		u.RawQuery = "tag=" + url.QueryEscape(amzTag)
		u.Fragment = ""
		return u.String()
	case "mercadolivre":
		if mlToolID == "" {
			return rawURL
		}
		sep := "?"
		if strings.Contains(rawURL, "?") {
			sep = "&"
		}
		return fmt.Sprintf("%s%smatt_tool=%s&matt_source=affiliate",
			rawURL, sep, url.QueryEscape(mlToolID))
	}
	return rawURL
}

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
