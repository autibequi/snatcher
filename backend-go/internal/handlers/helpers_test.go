package handlers

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// failingResponseWriter força o encoder a falhar — Write retorna erro.
// Usado para validar que writeJSON loga ao invés de engolir o erro.
type failingResponseWriter struct {
	header http.Header
	status int
}

func newFailingRW() *failingResponseWriter {
	return &failingResponseWriter{header: make(http.Header)}
}

func (f *failingResponseWriter) Header() http.Header     { return f.header }
func (f *failingResponseWriter) WriteHeader(status int)  { f.status = status }
func (f *failingResponseWriter) Write(p []byte) (int, error) {
	return 0, http.ErrBodyNotAllowed
}

// TestWriteJSON_logsEncodeError: garante que erro do encoder produz log.
func TestWriteJSON_logsEncodeError(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn})))
	defer slog.SetDefault(old)

	w := newFailingRW()
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})

	logOut := buf.String()
	if !strings.Contains(logOut, "writeJSON: encode failed") {
		t.Fatalf("esperava log de encode failed, recebi: %q", logOut)
	}
}

// TestWriteJSON_happyPath: scenario padrão funciona normal.
func TestWriteJSON_happyPath(t *testing.T) {
	rr := httptest.NewRecorder()
	writeJSON(rr, http.StatusCreated, map[string]string{"id": "abc"})

	if rr.Code != http.StatusCreated {
		t.Fatalf("esperava 201, recebi %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("esperava Content-Type application/json, recebi %q", ct)
	}
	if !strings.Contains(rr.Body.String(), `"id":"abc"`) {
		t.Fatalf("body inesperado: %q", rr.Body.String())
	}
}
