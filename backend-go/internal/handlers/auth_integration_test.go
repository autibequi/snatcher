package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"snatcher/backendv2/internal/testutil"

	"github.com/golang-jwt/jwt/v5"
)

// TestAuthLogin cobre os cenários de POST /api/auth/login.
func TestAuthLogin(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	anon := srv.NewAnonClient(t)

	t.Run("credenciais corretas retorna 200 e JWT valido", func(t *testing.T) {
		body := map[string]string{
			"email":    srv.AdminUser,
			"password": srv.AdminPass,
		}
		resp, data := anon.Post("/api/auth/login", body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}

		var payload struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			TokenType    string `json:"token_type"`
			User         struct {
				ID    int64  `json:"id"`
				Email string `json:"email"`
				Role  string `json:"role"`
			} `json:"user"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, data)
		}
		if payload.AccessToken == "" {
			t.Fatal("access_token vazio na resposta")
		}
		if payload.RefreshToken == "" {
			t.Fatal("refresh_token vazio na resposta")
		}
		if payload.TokenType != "bearer" {
			t.Errorf("token_type esperado 'bearer', got %q", payload.TokenType)
		}
		if payload.User.Email != srv.AdminUser {
			t.Errorf("user.email esperado %q, got %q", srv.AdminUser, payload.User.Email)
		}

		// Verificar assinatura do JWT.
		tok, err := jwt.Parse(payload.AccessToken, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(srv.JWTSecret), nil
		})
		if err != nil {
			t.Fatalf("JWT inválido ou assinatura incorreta: %v", err)
		}
		if !tok.Valid {
			t.Fatal("JWT não é válido")
		}
		claims, ok := tok.Claims.(jwt.MapClaims)
		if !ok {
			t.Fatal("claims não são MapClaims")
		}
		if sub, _ := claims["sub"].(float64); int64(sub) != payload.User.ID {
			t.Errorf("claim 'sub' esperado %d, got %v", payload.User.ID, sub)
		}
		email, _ := claims["email"].(string)
		if email != srv.AdminUser {
			t.Errorf("claim 'email' esperado %q, got %q", srv.AdminUser, email)
		}
	})

	t.Run("senha errada retorna 401", func(t *testing.T) {
		body := map[string]string{
			"email":    srv.AdminUser,
			"password": "senha-errada",
		}
		resp, data := anon.Post("/api/auth/login", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d — body: %s", resp.StatusCode, data)
		}
	})

	t.Run("email desconhecido retorna 401", func(t *testing.T) {
		body := map[string]string{
			"email":    "noexist@test.local",
			"password": "qualquercoisa",
		}
		resp, data := anon.Post("/api/auth/login", body)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d — body: %s", resp.StatusCode, data)
		}
	})

	t.Run("payload sem email/password retorna 400", func(t *testing.T) {
		resp, data := anon.Post("/api/auth/login", map[string]string{"foo": "bar"})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("esperado 400, got %d — body: %s", resp.StatusCode, data)
		}

		// Body malformado deve retornar 400 com campo "error".
		resp2, data2 := anon.Post("/api/auth/login", "nao-e-json{{{{")
		if resp2.StatusCode != http.StatusBadRequest {
			t.Fatalf("payload malformado: esperado 400, got %d — body: %s", resp2.StatusCode, data2)
		}
		var errPayload struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal(data2, &errPayload); err != nil {
			t.Fatalf("resposta de erro não é JSON estruturado: %v — body: %s", err, data2)
		}
		if errPayload.Error == "" {
			t.Error("campo 'error' vazio na resposta 400")
		}
	})
}

// TestAuthRefresh cobre os cenários de POST /api/auth/refresh.
func TestAuthRefresh(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	anon := srv.NewAnonClient(t)

	// Obter par inicial via login
	loginBody := map[string]string{"email": srv.AdminUser, "password": srv.AdminPass}
	resp, data := anon.Post("/api/auth/login", loginBody)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login: esperado 200, got %d — body: %s", resp.StatusCode, data)
	}
	var loginPayload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.Unmarshal(data, &loginPayload); err != nil {
		t.Fatalf("unmarshal login: %v", err)
	}

	t.Run("refresh valido retorna novo par", func(t *testing.T) {
		resp, data := anon.Post("/api/auth/refresh", map[string]string{
			"refresh_token": loginPayload.RefreshToken,
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("unmarshal refresh: %v", err)
		}
		if payload.AccessToken == "" {
			t.Error("access_token vazio")
		}
		if payload.RefreshToken == "" {
			t.Error("refresh_token vazio")
		}
		// Token rotacionado — o antigo deve ser inválido agora
		resp2, data2 := anon.Post("/api/auth/refresh", map[string]string{
			"refresh_token": loginPayload.RefreshToken, // token antigo
		})
		if resp2.StatusCode != http.StatusUnauthorized {
			t.Fatalf("token antigo deveria ser revogado, got %d — body: %s", resp2.StatusCode, data2)
		}
	})

	t.Run("refresh token invalido retorna 401", func(t *testing.T) {
		resp, data := anon.Post("/api/auth/refresh", map[string]string{
			"refresh_token": "token-inexistente-abc123",
		})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d — body: %s", resp.StatusCode, data)
		}
	})

	t.Run("body sem refresh_token retorna 400", func(t *testing.T) {
		resp, data := anon.Post("/api/auth/refresh", map[string]string{"foo": "bar"})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("esperado 400, got %d — body: %s", resp.StatusCode, data)
		}
	})
}

// TestAuthLogout cobre os cenários de POST /api/auth/logout.
func TestAuthLogout(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)
	anon := srv.NewAnonClient(t)

	// Login para obter refresh token
	loginBody := map[string]string{"email": srv.AdminUser, "password": srv.AdminPass}
	_, data := anon.Post("/api/auth/login", loginBody)
	var loginPayload struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = json.Unmarshal(data, &loginPayload)

	t.Run("logout revoga refresh_token", func(t *testing.T) {
		resp, data := anon.Post("/api/auth/logout", map[string]string{
			"refresh_token": loginPayload.RefreshToken,
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}

		// Tentar usar o refresh token revogado
		resp2, data2 := anon.Post("/api/auth/refresh", map[string]string{
			"refresh_token": loginPayload.RefreshToken,
		})
		if resp2.StatusCode != http.StatusUnauthorized {
			t.Fatalf("token revogado deveria retornar 401, got %d — body: %s", resp2.StatusCode, data2)
		}
	})

	t.Run("logout sem body retorna 200", func(t *testing.T) {
		resp, data := anon.Post("/api/auth/logout", map[string]string{})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
	})
}

// TestAuthMe cobre os cenários de GET /api/auth/me.
func TestAuthMe(t *testing.T) {
	db := testutil.NewTestDB(t)
	srv := testutil.NewTestServer(t, db)

	t.Run("sem Authorization retorna 401", func(t *testing.T) {
		anon := srv.NewAnonClient(t)
		resp, data := anon.Get("/api/auth/me")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d — body: %s", resp.StatusCode, data)
		}
	})

	t.Run("JWT valido retorna user payload", func(t *testing.T) {
		client := srv.NewClient(t)
		resp, data := client.Get("/api/auth/me")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("esperado 200, got %d — body: %s", resp.StatusCode, data)
		}
		var payload struct {
			ID    int64  `json:"id"`
			Email string `json:"email"`
			Name  string `json:"name"`
			Role  string `json:"role"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			t.Fatalf("resposta não é JSON válido: %v — body: %s", err, data)
		}
		if payload.Email == "" {
			t.Error("campo 'email' vazio na resposta")
		}
		if payload.ID == 0 {
			t.Error("campo 'id' zero na resposta")
		}
	})

	t.Run("JWT expirado retorna 401", func(t *testing.T) {
		expiredTok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":   float64(srv.AdminUserID),
			"email": srv.AdminUser,
			"exp":   time.Now().Add(-1 * time.Hour).Unix(), // expirado há 1h
		})
		signed, err := expiredTok.SignedString([]byte(srv.JWTSecret))
		if err != nil {
			t.Fatalf("assinar JWT expirado: %v", err)
		}

		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/auth/me", nil)
		req.Header.Set("Authorization", "Bearer "+signed)
		httpResp, err := srv.Client().Do(req)
		if err != nil {
			t.Fatalf("executar request: %v", err)
		}
		defer httpResp.Body.Close()
		if httpResp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("esperado 401, got %d", httpResp.StatusCode)
		}
	})
}
