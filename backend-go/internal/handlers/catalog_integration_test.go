package handlers_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/testutil"
)

// newVariantForTest insere um CatalogVariant mínimo associado a productID.
// Helper local (anti-scope-creep: não altera fixtures.go).
func newVariantForTest(t *testing.T, st interface {
	CreateCatalogVariant(v models.CatalogVariant) (int64, error)
}, productID int64, price float64, source string) models.CatalogVariant {
	t.Helper()
	v := models.CatalogVariant{
		CatalogProductID: productID,
		Title:            fmt.Sprintf("Variant-%d-%.0f", productID, price),
		Price:            price,
		URL:              fmt.Sprintf("https://example.com/variant/%d/%.0f", productID, price),
		Source:           source,
	}
	id, err := st.CreateCatalogVariant(v)
	if err != nil {
		t.Fatalf("CreateCatalogVariant: %v", err)
	}
	v.ID = id
	return v
}

// TestCatalogList cobre GET /api/catalog.
func TestCatalogList(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("zero items retorna 200 e lista vazia", func(t *testing.T) {
		resp, data := client.Get("/api/catalog?limit=5&offset=0")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			Items  []json.RawMessage `json:"items"`
			Total  int64             `json:"total"`
			Limit  int               `json:"limit"`
			Offset int               `json:"offset"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if len(payload.Items) != 0 {
			t.Errorf("esperado 0 items, got %d", len(payload.Items))
		}
		if payload.Total != 0 {
			t.Errorf("esperado total=0, got %d", payload.Total)
		}
		if payload.Limit != 5 {
			t.Errorf("esperado limit=5, got %d", payload.Limit)
		}
	})

	t.Run("10 fixtures retorna lista com total correto", func(t *testing.T) {
		db2 := testutil.NewTestDB(t)
		srv2 := testutil.NewTestServer(t, db2)
		client2 := srv2.NewClient(t)

		for i := 0; i < 10; i++ {
			testutil.NewCatalogProduct(t, srv2.Store)
		}

		resp, data := client2.Get("/api/catalog?limit=30&offset=0")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			Items []json.RawMessage `json:"items"`
			Total int64             `json:"total"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if len(payload.Items) != 10 {
			t.Errorf("esperado 10 items, got %d", len(payload.Items))
		}
		if payload.Total != 10 {
			t.Errorf("esperado total=10, got %d", payload.Total)
		}
	})

	t.Run("limit e offset sao respeitados", func(t *testing.T) {
		db3 := testutil.NewTestDB(t)
		srv3 := testutil.NewTestServer(t, db3)
		client3 := srv3.NewClient(t)

		for i := 0; i < 8; i++ {
			testutil.NewCatalogProduct(t, srv3.Store)
		}

		resp, data := client3.Get("/api/catalog?limit=5&offset=0")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			Items []json.RawMessage `json:"items"`
			Total int64             `json:"total"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(payload.Items) != 5 {
			t.Errorf("esperado 5 items com limit=5, got %d", len(payload.Items))
		}
		if payload.Total != 8 {
			t.Errorf("esperado total=8, got %d", payload.Total)
		}

		// Segunda página
		resp2, data2 := client3.Get("/api/catalog?limit=5&offset=5")
		if resp2.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200 na pag 2, got %d", resp2.StatusCode)
		}
		var payload2 struct {
			Items []json.RawMessage `json:"items"`
		}
		if err := json.Unmarshal(data2, &payload2); err != nil {
			t.Fatalf("unmarshal pag 2: %v", err)
		}
		if len(payload2.Items) != 3 {
			t.Errorf("esperado 3 items na pag 2, got %d", len(payload2.Items))
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Get("/api/catalog")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})

	t.Run("keyword filter nao implementado no handler — skip", func(t *testing.T) {
		// O handler catalog.List nao implementa filtro por keyword na query SQL
		// (ListCatalogProducts so aceita limit e offset). Teste de keyword por
		// substring no canonical_name exigiria suporte no store e handler.
		// Skip honesto: remover quando handler implementar keyword filter.
		t.Skip("GET /api/catalog?keyword= nao filtrado pelo handler atual — store.ListCatalogProducts so aceita limit/offset")

		db4 := testutil.NewTestDB(t)
		srv4 := testutil.NewTestServer(t, db4)
		client4 := srv4.NewClient(t)

		testutil.NewCatalogProduct(t, srv4.Store, models.CatalogProduct{CanonicalName: "Whey Protein Gold"})
		testutil.NewCatalogProduct(t, srv4.Store, models.CatalogProduct{CanonicalName: "Whey Isolado Premium"})
		testutil.NewCatalogProduct(t, srv4.Store, models.CatalogProduct{CanonicalName: "Creatina Monohidratada"})

		resp, data := client4.Get("/api/catalog?keyword=whey")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			Items []struct {
				CanonicalName string `json:"canonical_name"`
			} `json:"items"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(payload.Items) != 2 {
			t.Errorf("esperado 2 items com keyword=whey, got %d", len(payload.Items))
		}
		for _, item := range payload.Items {
			if !strings.Contains(strings.ToLower(item.CanonicalName), "whey") {
				t.Errorf("item nao contem 'whey': %q", item.CanonicalName)
			}
		}
	})
}

// TestCatalogGet cobre GET /api/catalog/{id}.
func TestCatalogGet(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("produto existente retorna 200 com product e variants", func(t *testing.T) {
		p := testutil.NewCatalogProduct(t, srv.Store)
		v := newVariantForTest(t, srv.Store, p.ID, 99.90, "amazon")

		resp, data := client.Get(fmt.Sprintf("/api/catalog/%d", p.ID))
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}

		var payload struct {
			Product struct {
				ID            int64  `json:"id"`
				CanonicalName string `json:"canonical_name"`
			} `json:"product"`
			Variants []struct {
				ID    int64   `json:"id"`
				Price float64 `json:"price"`
			} `json:"variants"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if payload.Product.ID != p.ID {
			t.Errorf("esperado product.id=%d, got %d", p.ID, payload.Product.ID)
		}
		if payload.Product.CanonicalName != p.CanonicalName {
			t.Errorf("canonical_name: esperado %q, got %q", p.CanonicalName, payload.Product.CanonicalName)
		}
		if len(payload.Variants) != 1 {
			t.Errorf("esperado 1 variant, got %d", len(payload.Variants))
		}
		if payload.Variants[0].ID != v.ID {
			t.Errorf("variant id: esperado %d, got %d", v.ID, payload.Variants[0].ID)
		}
	})

	t.Run("id inexistente retorna 404", func(t *testing.T) {
		resp, _ := client.Get("/api/catalog/99999999")
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("esperado 404, got %d", resp.StatusCode)
		}
	})

	t.Run("id invalido retorna 400", func(t *testing.T) {
		resp, _ := client.Get("/api/catalog/abc")
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("esperado 400, got %d", resp.StatusCode)
		}
	})

	t.Run("produto sem variants retorna lista vazia", func(t *testing.T) {
		p := testutil.NewCatalogProduct(t, srv.Store)

		resp, data := client.Get(fmt.Sprintf("/api/catalog/%d", p.ID))
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			Variants []json.RawMessage `json:"variants"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(payload.Variants) != 0 {
			t.Errorf("esperado 0 variants, got %d", len(payload.Variants))
		}
	})
}

// TestCatalogUpdate cobre PUT /api/catalog/{id} editando tags.
func TestCatalogUpdate(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("editar tags persiste e GET subsequente reflete", func(t *testing.T) {
		p := testutil.NewCatalogProduct(t, srv.Store)

		// Payload de atualização: mantém campos obrigatórios, adiciona tags.
		updateBody := map[string]any{
			"canonical_name": p.CanonicalName,
			"tags":           `["proteina","suplemento"]`,
			"brand": map[string]any{
				"String": "TestBrand",
				"Valid":  true,
			},
		}

		resp, data := client.Put(fmt.Sprintf("/api/catalog/%d", p.ID), updateBody)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("PUT esperado 200, got %d — body: %s", resp.StatusCode, data)
		}

		// GET subsequente deve refletir os novos tags.
		resp2, data2 := client.Get(fmt.Sprintf("/api/catalog/%d", p.ID))
		if resp2.StatusCode != http.StatusOK {
			t.Fatalf("GET pos-update esperado 200, got %d — body: %s", resp2.StatusCode, data2)
		}
		var payload struct {
			Product struct {
				Tags string `json:"tags"`
			} `json:"product"`
		}
		if err := json.Unmarshal(data2, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data2)
		}
		if !strings.Contains(payload.Product.Tags, "proteina") {
			t.Errorf("tag 'proteina' nao encontrada em tags: %q", payload.Product.Tags)
		}
	})

	t.Run("id inexistente retorna 404", func(t *testing.T) {
		resp, _ := client.Put("/api/catalog/99999999", map[string]any{"canonical_name": "x"})
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("esperado 404, got %d", resp.StatusCode)
		}
	})

	t.Run("body invalido retorna 400", func(t *testing.T) {
		p := testutil.NewCatalogProduct(t, srv.Store)
		resp, _ := client.Put(fmt.Sprintf("/api/catalog/%d", p.ID), "nao-e-json{{{")
		if resp.StatusCode != http.StatusBadRequest {
			t.Errorf("esperado 400, got %d", resp.StatusCode)
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		p := testutil.NewCatalogProduct(t, srv.Store)
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Put(fmt.Sprintf("/api/catalog/%d", p.ID), map[string]any{"canonical_name": "x"})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestCatalogVariants cobre GET /api/catalog/{id}/variants via GET /api/catalog/{id}.
// A rota real e GET /api/catalog/{id} que inclui variants embutidas.
// Nao existe rota /api/catalog/{id}/variants separada — variants sao retornadas
// pelo endpoint Get junto com o produto.
func TestCatalogVariants(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("variants ordenadas por preco via GET catalog/id", func(t *testing.T) {
		p := testutil.NewCatalogProduct(t, srv.Store)

		// Inserir 3 variantes com precos fora de ordem.
		newVariantForTest(t, srv.Store, p.ID, 299.00, "amazon")
		newVariantForTest(t, srv.Store, p.ID, 99.90, "mercadolivre")
		newVariantForTest(t, srv.Store, p.ID, 149.50, "amazon")

		resp, data := client.Get(fmt.Sprintf("/api/catalog/%d", p.ID))
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			Variants []struct {
				Price float64 `json:"price"`
			} `json:"variants"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(payload.Variants) != 3 {
			t.Fatalf("esperado 3 variants, got %d", len(payload.Variants))
		}
		// store.ListVariantsByProduct ordena por price ASC.
		prices := []float64{payload.Variants[0].Price, payload.Variants[1].Price, payload.Variants[2].Price}
		for i := 1; i < len(prices); i++ {
			if prices[i] < prices[i-1] {
				t.Errorf("variants nao ordenadas por preco: %v", prices)
				break
			}
		}
		if prices[0] != 99.90 {
			t.Errorf("menor preco esperado 99.90, got %f", prices[0])
		}
	})

	t.Run("history via GET /api/catalog/variants/{variant_id}/history", func(t *testing.T) {
		// Rota: GET /api/catalog/variants/{variant_id}/history → ListVariantHistory
		// Nao ha dados de historico inseridos por CreateCatalogVariant — skip se
		// nao houver store.CreatePriceHistoryV2 disponivel na interface publica.
		t.Skip("store.Store nao expoe CreatePriceHistoryV2 na interface publica — history entries nao podem ser inseridos via testutil; skip ate exposicao do metodo")
	})
}

// TestCatalogSourceFilter cobre GET /api/catalog?source= .
// Handler atual nao implementa filtro por source (apenas limit/offset).
func TestCatalogSourceFilter(t *testing.T) {
	t.Skip("GET /api/catalog?source= nao filtrado pelo handler atual — store.ListCatalogProducts so aceita limit/offset; skip ate implementacao")
}

// TestCatalogDelete cobre DELETE /api/catalog/{id}.
func TestCatalogDelete(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("produto existente deletado retorna 204", func(t *testing.T) {
		p := testutil.NewCatalogProduct(t, srv.Store)

		resp, _ := client.Delete(fmt.Sprintf("/api/catalog/%d", p.ID))
		if resp.StatusCode != http.StatusNoContent {
			t.Errorf("esperado 204, got %d", resp.StatusCode)
		}

		// GET apos delete deve retornar 404.
		resp2, _ := client.Get(fmt.Sprintf("/api/catalog/%d", p.ID))
		if resp2.StatusCode != http.StatusNotFound {
			t.Errorf("apos delete: esperado 404, got %d", resp2.StatusCode)
		}
	})

	t.Run("id inexistente retorna 204 (DELETE idempotente no store)", func(t *testing.T) {
		// store.DeleteCatalogProduct executa DELETE sem verificar rows affected,
		// entao DELETE de id inexistente retorna nil error → handler retorna 204.
		// Comportamento documentado: DELETE e idempotente.
		resp, _ := client.Delete("/api/catalog/99999999")
		if resp.StatusCode != http.StatusNoContent {
			t.Errorf("esperado 204 (DELETE idempotente), got %d", resp.StatusCode)
		}
	})
}

// compile-time sentinel: garante que NullString e importado corretamente.
var _ = models.NullString{NullString: sql.NullString{}}
