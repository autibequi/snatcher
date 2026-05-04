package testutil

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Client é um wrapper sobre http.Client que injeta automaticamente Bearer JWT
// e oferece helpers JSON-friendly. Cada teste cria seu próprio Client a partir
// do TestServer e do segredo correspondente.
type Client struct {
	t       *testing.T
	baseURL string
	token   string
	hc      *http.Client
}

// NewClient retorna um Client assinado com JWT válido para o admin.
func (s *TestServer) NewClient(t *testing.T) *Client {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   float64(s.AdminUserID), // sub deve ser float64 para jwt.MapClaims
		"email": s.AdminUser,
		"role":  "admin",
		"exp":   time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString([]byte(s.JWTSecret))
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	return &Client{t: t, baseURL: s.URL, token: signed, hc: s.Client()}
}

// NewAnonClient retorna um Client sem JWT — útil para testar 401.
func (s *TestServer) NewAnonClient(t *testing.T) *Client {
	t.Helper()
	return &Client{t: t, baseURL: s.URL, hc: s.Client()}
}

// Do envia request, devolve resp + body já lido. Não fecha por você apenas em
// erro inesperado de I/O.
func (c *Client) Do(method, path string, body any) (*http.Response, []byte) {
	c.t.Helper()
	var buf io.Reader
	if body != nil {
		switch v := body.(type) {
		case string:
			buf = strings.NewReader(v)
		case []byte:
			buf = bytes.NewReader(v)
		default:
			data, err := json.Marshal(body)
			if err != nil {
				c.t.Fatalf("marshal body: %v", err)
			}
			buf = bytes.NewReader(data)
		}
	}
	req, err := http.NewRequest(method, c.baseURL+path, buf)
	if err != nil {
		c.t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		c.t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		c.t.Fatalf("read body: %v", err)
	}
	return resp, data
}

// DecodeJSON lê o body como JSON no destino fornecido.
func (c *Client) DecodeJSON(data []byte, dst any) {
	c.t.Helper()
	if err := json.Unmarshal(data, dst); err != nil {
		c.t.Fatalf("unmarshal %s: %v", string(data), err)
	}
}

// Get/Post/Put/Patch/Delete são açúcar.
func (c *Client) Get(path string) (*http.Response, []byte)       { return c.Do(http.MethodGet, path, nil) }
func (c *Client) Post(path string, b any) (*http.Response, []byte) { return c.Do(http.MethodPost, path, b) }
func (c *Client) Put(path string, b any) (*http.Response, []byte)  { return c.Do(http.MethodPut, path, b) }
func (c *Client) Patch(path string, b any) (*http.Response, []byte) {
	return c.Do(http.MethodPatch, path, b)
}
func (c *Client) Delete(path string) (*http.Response, []byte) { return c.Do(http.MethodDelete, path, nil) }
