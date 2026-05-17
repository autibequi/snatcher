package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	adminhnd "snatcher/backendv2/internal/handlers/admin"
)

// TestRequireAdmin_allowed garante 200 quando o context carrega role=admin.
func TestRequireAdmin_allowed(t *testing.T) {
	called := false
	h := RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/danger/soft-wipe", nil)
	req = req.WithContext(adminhnd.CtxWithRole(req.Context(), "admin"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("esperava 200, recebi %d", rr.Code)
	}
	if !called {
		t.Fatal("next handler nao foi chamado")
	}
}

// TestRequireAdmin_forbidden_missing_role: ctx sem role nenhum → 403.
func TestRequireAdmin_forbidden_missing_role(t *testing.T) {
	called := false
	h := RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/danger/soft-wipe", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("esperava 403, recebi %d", rr.Code)
	}
	if called {
		t.Fatal("next handler foi chamado quando deveria estar bloqueado")
	}
}

// TestRequireAdmin_forbidden_wrong_role: role=operator → 403.
func TestRequireAdmin_forbidden_wrong_role(t *testing.T) {
	h := RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, role := range []string{"operator", "viewer", "", "ADMIN", "Admin"} {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req = req.WithContext(adminhnd.CtxWithRole(req.Context(), role))
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Errorf("role=%q: esperava 403, recebi %d", role, rr.Code)
		}
	}
}
