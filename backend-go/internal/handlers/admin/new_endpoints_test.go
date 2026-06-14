package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"
)

// newMockDB cria um *sqlx.DB ligado a um sqlmock.
func newMockDB(t *testing.T) (*sqlx.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return sqlx.NewDb(db, "sqlmock"), mock
}

// ─── LearnedWeightsHandler ──────────────────────────────────────────────────

func TestLearnedWeightsHandler_ReturnsRows(t *testing.T) {
	db, mock := newMockDB(t)

	cols := []string{
		"channel_id", "channel_name", "category_id", "category_name",
		"source_id", "source_name", "ctr_30d", "epc_30d",
		"samples_30d", "confidence", "updated_at",
	}
	rows := sqlmock.NewRows(cols).AddRow(
		int64(7), "Canal X", int64(3), "Eletrônicos",
		"amz", "Amazon", 0.12, 0.45,
		120, 0.8, time.Now(),
	)
	// min_samples default = 0
	mock.ExpectQuery("learned_weights_channel").WithArgs(0).WillReturnRows(rows)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/metrics/learned-weights", nil)
	rec := httptest.NewRecorder()
	LearnedWeightsHandler(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: esperava 200, got %d", rec.Code)
	}
	var out []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("json inválido: %v — body=%s", err, rec.Body.String())
	}
	if len(out) != 1 {
		t.Fatalf("esperava 1 row, got %d", len(out))
	}
	if out[0]["channel_name"] != "Canal X" || out[0]["samples_30d"].(float64) != 120 {
		t.Errorf("payload inesperado: %+v", out[0])
	}
}

func TestLearnedWeightsHandler_EmptyReturnsArrayNotNull(t *testing.T) {
	db, mock := newMockDB(t)
	cols := []string{"channel_id", "channel_name", "category_id", "category_name", "source_id", "source_name", "ctr_30d", "epc_30d", "samples_30d", "confidence", "updated_at"}
	mock.ExpectQuery("learned_weights_channel").WithArgs(50).WillReturnRows(sqlmock.NewRows(cols))

	// min_samples=50 deve ser passado como arg.
	req := httptest.NewRequest(http.MethodGet, "/api/admin/metrics/learned-weights?min_samples=50", nil)
	rec := httptest.NewRecorder()
	LearnedWeightsHandler(db).ServeHTTP(rec, req)

	if got := rec.Body.String(); got != "[]\n" && got != "[]" {
		t.Errorf("vazio deve serializar como [] (nunca null), got %q", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("expectativas sqlmock (min_samples=50 não chegou?): %v", err)
	}
}

// ─── ListCanonicalChildrenHandler ───────────────────────────────────────────

// withChiID injeta o URL param {id} no contexto chi para o handler enxergar.
func withChiID(req *http.Request, id string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func TestCanonicalChildrenHandler_BadIDReturns400(t *testing.T) {
	db, _ := newMockDB(t)
	req := httptest.NewRequest(http.MethodGet, "/api/admin/canonical-groups/abc/children", nil)
	req = withChiID(req, "abc") // não numérico
	rec := httptest.NewRecorder()
	ListCanonicalChildrenHandler(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("id inválido deve dar 400, got %d", rec.Code)
	}
}

func TestCanonicalChildrenHandler_ReturnsChildren(t *testing.T) {
	db, mock := newMockDB(t)
	cols := []string{"id", "title", "source_id", "marketplace", "price_current"}
	rows := sqlmock.NewRows(cols).
		AddRow(int64(500), "Geladeira X", "amz", "amz", 3569.0).
		AddRow(int64(501), "Geladeira Y", "ml", "ml", nil) // price null → ok
	mock.ExpectQuery("canonical_product_id").WithArgs(int64(499)).WillReturnRows(rows)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/canonical-groups/499/children", nil)
	req = withChiID(req, "499")
	rec := httptest.NewRecorder()
	ListCanonicalChildrenHandler(db).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: esperava 200, got %d", rec.Code)
	}
	var out []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("json inválido: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("esperava 2 filhos, got %d", len(out))
	}
	if out[0]["title"] != "Geladeira X" || out[0]["marketplace"] != "amz" {
		t.Errorf("filho 0 inesperado: %+v", out[0])
	}
	// price_current null deve ser omitido (omitempty) no 2º.
	if _, has := out[1]["price_current"]; has {
		t.Errorf("price_current null deveria ser omitido, got %+v", out[1])
	}
}

func TestCanonicalChildrenHandler_EmptyReturnsArrayNotNull(t *testing.T) {
	db, mock := newMockDB(t)
	cols := []string{"id", "title", "source_id", "marketplace", "price_current"}
	mock.ExpectQuery("canonical_product_id").WithArgs(int64(1)).WillReturnRows(sqlmock.NewRows(cols))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/canonical-groups/1/children", nil)
	req = withChiID(req, "1")
	rec := httptest.NewRecorder()
	ListCanonicalChildrenHandler(db).ServeHTTP(rec, req)

	if got := rec.Body.String(); got != "[]\n" && got != "[]" {
		t.Errorf("vazio deve serializar como [] (nunca null), got %q", got)
	}
}
