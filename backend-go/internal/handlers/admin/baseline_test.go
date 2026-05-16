package admin_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"snatcher/backendv2/internal/testutil"
)

// TestCaptureBaseline cobre POST /api/admin/baseline/capture.
func TestCaptureBaseline(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("capture retorna 201 com snapshot_id e metrics", func(t *testing.T) {
		resp, data := client.Post("/api/admin/baseline/capture", map[string]string{
			"scope": "global",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("esperado 201, got %d — body: %s", resp.StatusCode, data)
		}

		var payload struct {
			SnapshotID int64                  `json:"snapshot_id"`
			CapturedAt string                 `json:"captured_at"`
			Scope      string                 `json:"scope"`
			Metrics    map[string]interface{} `json:"metrics"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, data)
		}
		if payload.SnapshotID <= 0 {
			t.Errorf("snapshot_id esperado > 0, got %d", payload.SnapshotID)
		}
		if payload.CapturedAt == "" {
			t.Error("captured_at vazio")
		}
		if payload.Scope != "global" {
			t.Errorf("scope esperado 'global', got %q", payload.Scope)
		}
		if len(payload.Metrics) == 0 {
			t.Error("metrics vazio — esperado pelo menos 1 métrica")
		}
		// Verificar que métricas conhecidas estão presentes.
		expectedMetrics := []string{
			"dispatch_latency_p95_ms",
			"dispatch_latency_p99_ms",
			"queue_depth_p95",
			"llm_cost_today_usd_total",
			"llm_cost_today_per_provider",
			"quarantine_events_today",
			"ban_rate_per_channel",
			"discount_zero_messages_today",
			"ctr_per_channel_7d",
		}
		for _, m := range expectedMetrics {
			if _, ok := payload.Metrics[m]; !ok {
				t.Errorf("métrica %q ausente no payload", m)
			}
		}
	})

	t.Run("capture sem body usa scope=global", func(t *testing.T) {
		resp, data := client.Post("/api/admin/baseline/capture", nil)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("esperado 201, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			Scope string `json:"scope"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if payload.Scope != "global" {
			t.Errorf("scope default esperado 'global', got %q", payload.Scope)
		}
	})

	t.Run("sem autenticação retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Post("/api/admin/baseline/capture", nil)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestListBaseline cobre GET /api/admin/baseline.
func TestListBaseline(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("lista vazia quando não há snapshots", func(t *testing.T) {
		resp, data := client.Get("/api/admin/baseline/")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		// Aceita [] ou array vazio.
		if string(data) != "[]" && string(data) != "[]\n" {
			// Tentar parse como array.
			var arr []interface{}
			if err := json.Unmarshal(data, &arr); err != nil {
				t.Fatalf("resposta não é array JSON: %v — body: %s", err, data)
			}
			if len(arr) != 0 {
				t.Errorf("esperado array vazio, got %d elementos", len(arr))
			}
		}
	})

	t.Run("lista retorna snapshot após capture", func(t *testing.T) {
		// Capturar um snapshot primeiro.
		resp, data := client.Post("/api/admin/baseline/capture", nil)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("capture: esperado 201, got %d — body: %s", resp.StatusCode, data)
		}

		resp, data = client.Get("/api/admin/baseline/")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("list: esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var arr []struct {
			ID         int64  `json:"id"`
			CapturedAt string `json:"captured_at"`
			Scope      string `json:"scope"`
		}
		if err := json.Unmarshal(data, &arr); err != nil {
			t.Fatalf("unmarshal list: %v — body: %s", err, data)
		}
		if len(arr) == 0 {
			t.Error("esperado pelo menos 1 snapshot na lista")
		}
	})

	t.Run("sem autenticação retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Get("/api/admin/baseline/")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestCompareBaseline cobre GET /api/admin/baseline/compare.
func TestCompareBaseline(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("compare sem from e to retorna 400", func(t *testing.T) {
		resp, data := client.Get("/api/admin/baseline/compare")
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("esperado 400, got %d — body: %s", resp.StatusCode, data)
		}
	})

	t.Run("compare com IDs inexistentes retorna 404", func(t *testing.T) {
		resp, data := client.Get("/api/admin/baseline/compare?from=99999&to=99998")
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("esperado 404, got %d — body: %s", resp.StatusCode, data)
		}
	})

	t.Run("compare retorna diff entre dois snapshots reais", func(t *testing.T) {
		// Capturar dois snapshots.
		resp1, data1 := client.Post("/api/admin/baseline/capture", nil)
		if resp1.StatusCode != http.StatusCreated {
			t.Fatalf("capture 1: esperado 201, got %d — body: %s", resp1.StatusCode, data1)
		}
		var snap1 struct {
			SnapshotID int64 `json:"snapshot_id"`
		}
		if err := json.Unmarshal(data1, &snap1); err != nil {
			t.Fatalf("unmarshal snap1: %v", err)
		}

		resp2, data2 := client.Post("/api/admin/baseline/capture", nil)
		if resp2.StatusCode != http.StatusCreated {
			t.Fatalf("capture 2: esperado 201, got %d — body: %s", resp2.StatusCode, data2)
		}
		var snap2 struct {
			SnapshotID int64 `json:"snapshot_id"`
		}
		if err := json.Unmarshal(data2, &snap2); err != nil {
			t.Fatalf("unmarshal snap2: %v", err)
		}

		// Comparar.
		url := "/api/admin/baseline/compare?from=" +
			itoa64(snap1.SnapshotID) + "&to=" + itoa64(snap2.SnapshotID)
		resp, data := client.Get(url)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("compare: esperado 200, got %d — body: %s", resp.StatusCode, data)
		}

		var payload struct {
			From map[string]interface{} `json:"from"`
			To   map[string]interface{} `json:"to"`
			Diff map[string]interface{} `json:"diff"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal compare: %v — body: %s", err, data)
		}
		if payload.From == nil {
			t.Error("campo 'from' ausente")
		}
		if payload.To == nil {
			t.Error("campo 'to' ausente")
		}
		if payload.Diff == nil {
			t.Error("campo 'diff' ausente")
		}
	})

	t.Run("from inválido (não-numérico) retorna 400", func(t *testing.T) {
		resp, data := client.Get("/api/admin/baseline/compare?from=abc&to=1")
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("esperado 400, got %d — body: %s", resp.StatusCode, data)
		}
	})

	t.Run("sem autenticação retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Get("/api/admin/baseline/compare?from=1&to=2")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

func itoa64(n int64) string {
	return fmt.Sprintf("%d", n)
}
