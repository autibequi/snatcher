package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"snatcher/backendv2/internal/observability"
)

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// MetricsMiddleware records HTTP request duration and request count per
// method/path/status using the Prometheus metrics defined in observability.
func MetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)

		// Use the chi route pattern (e.g. "/api/catalog/{id}") so we avoid
		// high-cardinality label values from raw URL paths.
		path := chi.RouteContext(r.Context()).RoutePattern()
		if path == "" {
			path = r.URL.Path
		}

		statusLabel := fmt.Sprintf("%d", wrapped.status)
		method := r.Method
		duration := time.Since(start).Seconds()

		observability.HTTPRequestDuration.WithLabelValues(method, path, statusLabel).Observe(duration)
		observability.HTTPRequestsTotal.WithLabelValues(method, path, statusLabel).Inc()
	})
}
