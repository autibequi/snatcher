package scrapers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

const uaChromeLatest = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// applyPublicSiteHeaders sets headers many storefronts expect for non-API GETs.
func applyPublicSiteHeaders(req *http.Request) {
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", uaChromeLatest)
	}
	if req.Header.Get("Accept-Language") == "" {
		req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	}
	req.Header.Set("Sec-Ch-Ua", `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`)
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", `"Windows"`)
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
}

// optionalScraperCookie adds Cookie header from env when operators paste a browser session (e.g. cf_clearance).
func optionalScraperCookie(req *http.Request, envKey string) {
	raw := strings.TrimSpace(os.Getenv(envKey))
	if raw == "" {
		return
	}
	req.Header.Set("Cookie", raw)
}

func readBodyPrefix(resp *http.Response, max int) []byte {
	b, _ := io.ReadAll(io.LimitReader(resp.Body, int64(max)))
	return b
}

// errHTTPCrawl falha de crawl com detecção heurística de Cloudflare / anti-bot.
func errHTTPCrawl(source string, status int, bodyPrefix []byte) error {
	low := strings.ToLower(string(bodyPrefix))
	blocked := status == 403 || status == 429 || status == 503 ||
		strings.Contains(low, "cloudflare") ||
		strings.Contains(low, "cf-ray") ||
		strings.Contains(low, "just a moment") ||
		strings.Contains(low, "attention required") ||
		strings.Contains(low, "you have been blocked")

	msg := fmt.Sprintf("%s: HTTP %d", source, status)
	if blocked {
		msg += " — bloqueio anti-bot (Cloudflare ou similar). Crawlers só com cookie de sessão válido (env SNATCHER_SCRAPER_KINGUIN_COOKIE / SNATCHER_SCRAPER_HUMBLE_COOKIE), proxy residencial, ou worker com browser real"
	}
	return fmt.Errorf("%s", msg)
}
