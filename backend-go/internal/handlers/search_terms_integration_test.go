package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/testutil"
)

// TestSearchTerms cobre o CRUD completo de /api/search-terms.
func TestSearchTerms(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	c := srv.NewClient(t)

	// ------------------------------------------------------------------
	// GET /api/search-terms — lista vazia
	// ------------------------------------------------------------------
	t.Run("GET lista vazia retorna 200 e slice vazio", func(t *testing.T) {
		resp, body := c.Get("/api/search-terms")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, body)
		}
		// O handler devolve []models.SearchTerm serializado; quando vazio é "[]".
		var items []models.SearchTerm
		if err := json.Unmarshal(body, &items); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, body)
		}
		if len(items) != 0 {
			t.Errorf("esperado 0 items, got %d", len(items))
		}
	})

	// ------------------------------------------------------------------
	// GET /api/search-terms — lista com 2 fixtures
	// ------------------------------------------------------------------
	t.Run("GET lista com 2 fixtures retorna ambos", func(t *testing.T) {
		// Banco isolado por schema — cada sub-teste precisa de DB/Server próprios
		// para não herdar estado dos outros sub-testes que rodam em paralelo.
		db2 := testutil.NewTestDB(t)
		srv2 := testutil.NewTestServer(t, db2)
		c2 := srv2.NewClient(t)

		testutil.NewSearchTerm(t, srv2.Store)
		testutil.NewSearchTerm(t, srv2.Store)

		resp, body := c2.Get("/api/search-terms")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, body)
		}
		var items []models.SearchTerm
		if err := json.Unmarshal(body, &items); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, body)
		}
		if len(items) != 2 {
			t.Errorf("esperado 2 items, got %d", len(items))
		}
	})

	// ------------------------------------------------------------------
	// POST /api/search-terms — criação válida → 201 com ID
	// ------------------------------------------------------------------
	t.Run("POST valido cria e retorna 201 com ID", func(t *testing.T) {
		payload := map[string]any{
			"query":   "whey protein",
			"sources": "all",
			"min_val": 50.0,
			"max_val": 300.0,
		}
		resp, body := c.Post("/api/search-terms", payload)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("esperado 201, got %d — body: %s", resp.StatusCode, body)
		}
		var created models.SearchTerm
		if err := json.Unmarshal(body, &created); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, body)
		}
		if created.ID == 0 {
			t.Error("ID do SearchTerm criado é 0 — esperado >0")
		}
		if created.Query != "whey protein" {
			t.Errorf("query esperada 'whey protein', got %q", created.Query)
		}
	})

	// ------------------------------------------------------------------
	// POST /api/search-terms — sem campo query → 400 estruturado
	// ------------------------------------------------------------------
	t.Run("POST sem query retorna 400 estruturado", func(t *testing.T) {
		payload := map[string]any{
			"sources": "all",
			"min_val": 50.0,
		}
		resp, body := c.Post("/api/search-terms", payload)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("esperado 400, got %d — body: %s", resp.StatusCode, body)
		}
		var errResp struct {
			Error  string `json:"error"`
			Fields []struct {
				Field  string `json:"field"`
				Reason string `json:"reason"`
			} `json:"fields"`
		}
		if err := json.Unmarshal(body, &errResp); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, body)
		}
		if errResp.Error != "validation" {
			t.Errorf("campo 'error' esperado 'validation', got %q", errResp.Error)
		}
		found := false
		for _, f := range errResp.Fields {
			if f.Field == "Query" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("campo 'Query' não encontrado em fields: %s", body)
		}
	})

	// ------------------------------------------------------------------
	// POST /api/search-terms — min_val negativo → 400 (validator gte=0)
	// ------------------------------------------------------------------
	t.Run("POST com min_val negativo retorna 400", func(t *testing.T) {
		payload := map[string]any{
			"query":   "teste produto",
			"sources": "all",
			"min_val": -10.0,
		}
		resp, body := c.Post("/api/search-terms", payload)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("esperado 400, got %d — body: %s", resp.StatusCode, body)
		}
		var errResp struct {
			Error  string `json:"error"`
			Fields []struct {
				Field  string `json:"field"`
				Reason string `json:"reason"`
			} `json:"fields"`
		}
		if err := json.Unmarshal(body, &errResp); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, body)
		}
		if errResp.Error != "validation" {
			t.Errorf("campo 'error' esperado 'validation', got %q", errResp.Error)
		}
		found := false
		for _, f := range errResp.Fields {
			if f.Field == "MinVal" && f.Reason == "gte" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("field MinVal/gte não encontrado em fields: %s", body)
		}
	})

	// ------------------------------------------------------------------
	// PUT /api/search-terms/{id} — atualiza campo active → 200
	// ------------------------------------------------------------------
	t.Run("PUT atualiza campo active retorna 200", func(t *testing.T) {
		db3 := testutil.NewTestDB(t)
		srv3 := testutil.NewTestServer(t, db3)
		c3 := srv3.NewClient(t)

		term := testutil.NewSearchTerm(t, srv3.Store)

		// Inverte active (criado como true → setar false).
		active := false
		payload := map[string]any{
			"query":   term.Query,
			"sources": term.Sources,
			"min_val": term.MinVal,
			"max_val": term.MaxVal,
			"active":  active,
		}
		path := fmt.Sprintf("/api/search-terms/%d", term.ID)
		resp, body := c3.Put(path, payload)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, body)
		}
		var updated models.SearchTerm
		if err := json.Unmarshal(body, &updated); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, body)
		}
		if updated.Active != false {
			t.Errorf("esperado active=false, got %v", updated.Active)
		}
	})

	// ------------------------------------------------------------------
	// DELETE /api/search-terms/{id} → 204; GET subsequente → 404
	// ------------------------------------------------------------------
	t.Run("DELETE retorna 204 e GET subsequente retorna 404", func(t *testing.T) {
		db4 := testutil.NewTestDB(t)
		srv4 := testutil.NewTestServer(t, db4)
		c4 := srv4.NewClient(t)

		term := testutil.NewSearchTerm(t, srv4.Store)
		path := fmt.Sprintf("/api/search-terms/%d", term.ID)

		// DELETE
		resp, body := c4.Delete(path)
		if resp.StatusCode != http.StatusNoContent {
			t.Fatalf("DELETE: esperado 204, got %d — body: %s", resp.StatusCode, body)
		}

		// GET subsequente deve retornar 404.
		resp2, body2 := c4.Get(path)
		if resp2.StatusCode != http.StatusNotFound {
			t.Fatalf("GET após DELETE: esperado 404, got %d — body: %s", resp2.StatusCode, body2)
		}
	})
}
