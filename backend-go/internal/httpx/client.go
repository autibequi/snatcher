package httpx

import (
	"net/http"
	"time"
)

// userAgentTransport adiciona o User-Agent em toda requisição saindo,
// quando o caller não setou explicitamente.
type userAgentTransport struct {
	base http.RoundTripper
	ua   string
}

func (t *userAgentTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.ua != "" && req.Header.Get("User-Agent") == "" {
		// clona pra não mutar request do caller — safe vs reuse
		rc := req.Clone(req.Context())
		rc.Header.Set("User-Agent", t.ua)
		req = rc
	}
	return t.base.RoundTrip(req)
}

// NewClient é a factory canônica para construir *http.Client de outbound
// HTTP em services do snatcher. Padroniza timeout e User-Agent.
//
// Substitui o padrão `&http.Client{Timeout: X}` espalhado pelos services —
// se no futuro quisermos métricas/tracing por cliente, este é o único ponto
// de injeção.
//
// `timeout` é o ceiling total da request (dial + headers + body). `userAgent`
// é setado no header só se o caller não fornecer um próprio.
func NewClient(timeout time.Duration, userAgent string) *http.Client {
	base := http.DefaultTransport
	return &http.Client{
		Timeout:   timeout,
		Transport: &userAgentTransport{base: base, ua: userAgent},
	}
}
