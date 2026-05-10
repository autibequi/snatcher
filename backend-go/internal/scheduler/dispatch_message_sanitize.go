package scheduler

import (
	"net/url"
	"regexp"
	"strings"
)

// reHTTPURL captura URLs http(s) típicas em mensagens WhatsApp.
var reHTTPURL = regexp.MustCompile(`https?://[^\s<>\[\]()'"]+`)

func allowedOutboundURLHosts(affiliateLink string, appDomain string) map[string]struct{} {
	out := make(map[string]struct{})
	addHost := func(host string) {
		host = strings.TrimSpace(strings.ToLower(host))
		if host != "" {
			out[host] = struct{}{}
		}
	}
	parseAndAdd := func(raw string) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return
		}
		if !strings.Contains(raw, "://") {
			raw = "https://" + raw
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return
		}
		addHost(u.Hostname())
	}

	parseAndAdd(affiliateLink)
	parseAndAdd(appDomain)
	return out
}

// sanitizeDispatchOutboundText remove URLs cujo host não é o do link curto (afiliado).
// Impede envio de links crus de marketplace mesmo que copiados pelo LLM ou template.
func sanitizeDispatchOutboundText(text string, affiliateLink string, appDomain string) string {
	allowed := allowedOutboundURLHosts(affiliateLink, appDomain)
	if len(allowed) == 0 {
		return tidyMessageWhitespace(stripAllHTTPURLs(text))
	}

	out := reHTTPURL.ReplaceAllStringFunc(text, func(raw string) string {
		clean := trimTrailingURLPunct(raw)
		u, err := url.Parse(clean)
		if err != nil || u.Host == "" {
			return ""
		}
		h := strings.ToLower(u.Hostname())
		if _, ok := allowed[h]; ok {
			return raw
		}
		return ""
	})
	return tidyMessageWhitespace(out)
}

func trimTrailingURLPunct(s string) string {
	return strings.TrimRight(s, ".,;:!?)\"']")
}

func stripAllHTTPURLs(text string) string {
	return reHTTPURL.ReplaceAllString(text, "")
}

func tidyMessageWhitespace(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	lines := strings.Split(text, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "👉" || t == "👆" {
			continue
		}
		out = append(out, line)
	}
	text = strings.Join(out, "\n")
	for strings.Contains(text, "\n\n\n") {
		text = strings.ReplaceAll(text, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(text)
}
