package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"snatcher/backendv2/internal/testutil"
)

// TestChannelsCreate cobre POST /api/channels.
func TestChannelsCreate(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("payload valido cria channel e retorna 201 com ID", func(t *testing.T) {
		body := map[string]any{
			"name": "Canal Teste",
		}
		resp, data := client.Post("/api/channels", body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("esperado 201, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if payload.ID == 0 {
			t.Error("id deve ser != 0")
		}
		if payload.Name != "Canal Teste" {
			t.Errorf("name: esperado 'Canal Teste', got %q", payload.Name)
		}
	})

	t.Run("name ausente retorna 400", func(t *testing.T) {
		body := map[string]any{"description": "sem name"}
		resp, _ := client.Post("/api/channels", body)
		if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusUnprocessableEntity {
			t.Errorf("esperado 400/422, got %d", resp.StatusCode)
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Post("/api/channels", map[string]any{"name": "x"})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestChannelsGet cobre GET /api/channels/{id}.
func TestChannelsGet(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("channel existente retorna 200 com payload correto", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)

		resp, data := client.Get(fmt.Sprintf("/api/channels/%d", ch.ID))
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			ID      int64  `json:"id"`
			Name    string `json:"name"`
			Targets []any  `json:"targets"`
			Rules   []any  `json:"rules"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if payload.ID != ch.ID {
			t.Errorf("id: esperado %d, got %d", ch.ID, payload.ID)
		}
		if payload.Name != ch.Name {
			t.Errorf("name: esperado %q, got %q", ch.Name, payload.Name)
		}
		// targets e rules devem existir como listas (vazias ou populadas)
		if payload.Targets == nil {
			t.Error("targets deve ser lista (mesmo vazia), got nil")
		}
		if payload.Rules == nil {
			t.Error("rules deve ser lista (mesmo vazia), got nil")
		}
	})

	t.Run("id inexistente retorna 404", func(t *testing.T) {
		resp, _ := client.Get("/api/channels/99999999")
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("esperado 404, got %d", resp.StatusCode)
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Get("/api/channels/1")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestChannelsList cobre GET /api/channels (rota protegida).
func TestChannelsList(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Get("/api/channels")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})

	t.Run("com JWT retorna 200 e lista", func(t *testing.T) {
		client := srv.NewClient(t)
		testutil.NewChannel(t, srv.Store)
		testutil.NewChannel(t, srv.Store)

		resp, data := client.Get("/api/channels")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var channels []json.RawMessage
		if err := json.Unmarshal(data, &channels); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if len(channels) < 2 {
			t.Errorf("esperado >= 2 channels, got %d", len(channels))
		}
	})
}

// TestChannelsCreateTarget cobre POST /api/channels/{id}/targets.
func TestChannelsCreateTarget(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("adiciona ChannelTarget e retorna 201", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)

		body := map[string]any{
			"provider":   "whatsapp",
			"chat_id":    "5511999990000@s.whatsapp.net",
			"invite_url": "",
		}
		resp, data := client.Post(fmt.Sprintf("/api/channels/%d/targets", ch.ID), body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("esperado 201, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			ID        int64  `json:"id"`
			ChannelID int64  `json:"channel_id"`
			Provider  string `json:"provider"`
			ChatID    string `json:"chat_id"`
			Status    string `json:"status"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if payload.ID == 0 {
			t.Error("id deve ser != 0")
		}
		if payload.ChannelID != ch.ID {
			t.Errorf("channel_id: esperado %d, got %d", ch.ID, payload.ChannelID)
		}
		if payload.Provider != "whatsapp" {
			t.Errorf("provider: esperado 'whatsapp', got %q", payload.Provider)
		}
		if payload.ChatID != "5511999990000@s.whatsapp.net" {
			t.Errorf("chat_id: esperado '5511999990000@s.whatsapp.net', got %q", payload.ChatID)
		}
		if payload.Status != "ok" {
			t.Errorf("status: esperado 'ok' (default), got %q", payload.Status)
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Post(fmt.Sprintf("/api/channels/%d/targets", ch.ID), map[string]any{
			"provider": "whatsapp", "chat_id": "abc",
		})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestChannelsCreateRule cobre POST /api/channels/{id}/rules.
func TestChannelsCreateRule(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("adiciona ChannelRule e retorna 201", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)

		body := map[string]any{
			"match_type": "all",
			"notify_new": true,
		}
		resp, data := client.Post(fmt.Sprintf("/api/channels/%d/rules", ch.ID), body)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("esperado 201, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			ID        int64   `json:"id"`
			ChannelID int64   `json:"channel_id"`
			MatchType string  `json:"match_type"`
			NotifyNew bool    `json:"notify_new"`
			DropThreshold float64 `json:"drop_threshold"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal: %v — body: %s", err, data)
		}
		if payload.ID == 0 {
			t.Error("id deve ser != 0")
		}
		if payload.ChannelID != ch.ID {
			t.Errorf("channel_id: esperado %d, got %d", ch.ID, payload.ChannelID)
		}
		if payload.MatchType != "all" {
			t.Errorf("match_type: esperado 'all', got %q", payload.MatchType)
		}
		if !payload.NotifyNew {
			t.Error("notify_new: esperado true")
		}
		// drop_threshold deve ter o default 0.10 quando não enviado
		if payload.DropThreshold != 0.10 {
			t.Errorf("drop_threshold: esperado 0.10 (default), got %f", payload.DropThreshold)
		}
	})

	t.Run("match_type ausente retorna 400", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)
		body := map[string]any{"notify_new": true}
		resp, _ := client.Post(fmt.Sprintf("/api/channels/%d/rules", ch.ID), body)
		if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusUnprocessableEntity {
			t.Errorf("esperado 400/422, got %d", resp.StatusCode)
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Post(fmt.Sprintf("/api/channels/%d/rules", ch.ID), map[string]any{
			"match_type": "all",
		})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestChannelsUpdateTarget cobre PATCH /api/channels/{id}/targets/{target_id}.
func TestChannelsUpdateTarget(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("muda status do target e retorna 200", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)

		// Cria target via API para obter ID.
		createBody := map[string]any{
			"provider": "whatsapp",
			"chat_id":  "5511888880000@s.whatsapp.net",
		}
		createResp, createData := client.Post(fmt.Sprintf("/api/channels/%d/targets", ch.ID), createBody)
		if createResp.StatusCode != http.StatusCreated {
			t.Fatalf("criar target: esperado 201, got %d — body: %s", createResp.StatusCode, createData)
		}
		var created struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal(createData, &created); err != nil {
			t.Fatalf("unmarshal create: %v", err)
		}

		// PATCH para alterar status.
		patchBody := map[string]any{
			"provider": "whatsapp",
			"chat_id":  "5511888880000@s.whatsapp.net",
			"status":   "error",
		}
		patchURL := fmt.Sprintf("/api/channels/%d/targets/%d", ch.ID, created.ID)
		resp, data := client.Patch(patchURL, patchBody)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("PATCH esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var updated struct {
			ID     int64  `json:"id"`
			Status string `json:"status"`
		}
		if err := json.Unmarshal(data, &updated); err != nil {
			t.Fatalf("unmarshal patch: %v — body: %s", err, data)
		}
		if updated.Status != "error" {
			t.Errorf("status: esperado 'error', got %q", updated.Status)
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Patch(fmt.Sprintf("/api/channels/%d/targets/1", ch.ID), map[string]any{
			"provider": "whatsapp", "chat_id": "x", "status": "ok",
		})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestChannelsDeleteRule cobre DELETE /api/channels/{id}/rules/{rule_id}.
func TestChannelsDeleteRule(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	client := srv.NewClient(t)

	t.Run("deleta rule existente e retorna 204", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)

		// Cria rule via API.
		createBody := map[string]any{
			"match_type": "all",
			"notify_new": true,
		}
		createResp, createData := client.Post(fmt.Sprintf("/api/channels/%d/rules", ch.ID), createBody)
		if createResp.StatusCode != http.StatusCreated {
			t.Fatalf("criar rule: esperado 201, got %d — body: %s", createResp.StatusCode, createData)
		}
		var created struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal(createData, &created); err != nil {
			t.Fatalf("unmarshal create: %v", err)
		}

		// DELETE.
		deleteURL := fmt.Sprintf("/api/channels/%d/rules/%d", ch.ID, created.ID)
		resp, _ := client.Delete(deleteURL)
		if resp.StatusCode != http.StatusNoContent {
			t.Errorf("esperado 204, got %d", resp.StatusCode)
		}
	})

	t.Run("sem JWT retorna 401", func(t *testing.T) {
		ch := testutil.NewChannel(t, srv.Store)
		anon := srv.NewAnonClient(t)
		resp, _ := anon.Delete(fmt.Sprintf("/api/channels/%d/rules/1", ch.ID))
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("esperado 401, got %d", resp.StatusCode)
		}
	})
}

// TestChannelsSendDigest cobre POST /api/channels/{id}/send-digest.
// Exige adapter mock (adapters vazios no TestServer) — skip honesto.
func TestChannelsSendDigest(t *testing.T) {
	t.Skip("requires adapter mock — Fase 1+: TestServer usa AdapterRegistry{} vazio; send-digest com targets ativos sem adapter real retornaria sent=0 mas nao e o cenario de interesse")
}

// TestChannelsSendProduct cobre POST /api/channels/{id}/send-product.
// Exige adapter mock (adapters vazios no TestServer) — skip honesto.
func TestChannelsSendProduct(t *testing.T) {
	t.Skip("requires adapter mock — Fase 1+: TestServer usa AdapterRegistry{} vazio; send-product sem adapter real nao e testavel de forma significativa nesta fase")
}
