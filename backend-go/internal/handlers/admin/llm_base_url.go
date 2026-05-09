package admin

import (
	"strings"

	"snatcher/backendv2/internal/models"
)

// normalizeLLMBaseURL garante esquema http(s) para o cliente HTTP.
// Entradas como "vllm:8000" ou "host.docker.internal:8000" viram "http://...".
func normalizeLLMBaseURL(u string) string {
	u = strings.TrimSpace(u)
	if u == "" {
		return u
	}
	if !strings.Contains(u, "://") {
		return "http://" + u
	}
	return u
}

func nullString(ns models.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

func firstNonEmptyTrimmed(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
