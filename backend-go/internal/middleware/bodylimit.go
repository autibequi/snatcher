package middleware

import (
	"net/http"
)

// BodyLimit returns a middleware that limits the request body size.
// If the body exceeds maxBytes, subsequent reads by the handler will fail with
// an error, and the handler is expected to return 413 Payload Too Large.
// Using http.MaxBytesReader ensures the connection is not held open indefinitely
// when large uploads are attempted.
func BodyLimit(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}
