package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewClient_setsTimeout(t *testing.T) {
	c := NewClient(7*time.Second, "snatcher-test")
	if c.Timeout != 7*time.Second {
		t.Fatalf("timeout esperado 7s, got %v", c.Timeout)
	}
}

func TestNewClient_setsUserAgent(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient(2*time.Second, "snatcher-test-agent")
	if _, err := c.Get(srv.URL); err != nil {
		t.Fatalf("erro inesperado no GET: %v", err)
	}
	if seen != "snatcher-test-agent" {
		t.Fatalf("user-agent esperado %q, got %q", "snatcher-test-agent", seen)
	}
}

func TestNewClient_userAgentRespectsCallerOverride(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient(2*time.Second, "snatcher-default")
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	req.Header.Set("User-Agent", "explicit-caller-ua")
	if _, err := c.Do(req); err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if seen != "explicit-caller-ua" {
		t.Fatalf("esperava preservar UA do caller, got %q", seen)
	}
}

func TestNewClient_emptyUserAgentSkipsHeader(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("User-Agent")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient(2*time.Second, "")
	if _, err := c.Get(srv.URL); err != nil {
		t.Fatalf("erro: %v", err)
	}
	// Go default UA é "Go-http-client/1.1" — não setamos nada explícito.
	if seen == "" {
		t.Fatalf("ua nao deveria ser vazio (Go seta default), got %q", seen)
	}
}
