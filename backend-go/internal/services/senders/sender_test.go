package senders

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"
)

// TestIsBanIndicativeError verifica a classificação de erros transitórios vs. ban-indicativos.
func TestIsBanIndicativeError(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		wantBan  bool
	}{
		// Transitórios — NÃO devem contar como falha de conta
		{"nil",                    nil,                                                     false},
		{"ctx deadline",           context.DeadlineExceeded,                                false},
		{"ctx canceled",           context.Canceled,                                        false},
		{"timeout string",         errors.New("operation timed out"),                       false},
		{"connection refused",     errors.New("dial tcp: connect: connection refused"),     false},
		{"eof",                    errors.New("connection closed: eof"),                    false},
		{"i/o timeout",            errors.New("read tcp: i/o timeout"),                    false},
		{"evolution 500",          fmt.Errorf("evolution /sendText: status 500 — server"), false},
		{"evolution 502",          fmt.Errorf("evolution sendText status 502"),             false},
		{"evolution 503",          fmt.Errorf("evolution sendText status 503"),             false},
		{"evolution 504",          fmt.Errorf("evolution sendText status 504"),             false},
		{"evolution 429",          fmt.Errorf("evolution sendText status 429"),             false},
		// Conteúdo/mídia rejeitado — NÃO devem punir a conta (problema do envio, não da conta).
		// Os erros reais de sendMedia chegam pelados (sem corpo) → não há sinal de sessão morta.
		{"sendMedia 400 pelado",   fmt.Errorf("evolution sendMedia status 400: "),          false},
		{"sendMedia 400 bad req",  fmt.Errorf("evolution sendMedia status 400: Bad Request"), false},
		{"sendMedia 404",          fmt.Errorf("evolution sendMedia status 404: "),          false},
		{"sendMedia 413",          fmt.Errorf("evolution sendMedia status 413: payload too large"), false},
		{"sendMedia 415",          fmt.Errorf("evolution sendMedia status 415: unsupported media"), false},
		{"sendMedia 422",          fmt.Errorf("evolution sendMedia status 422: "),          false},
		// Modem/instância caído — infra do modem, NÃO punir a conta (transitório).
		{"400 + connection closed", fmt.Errorf("evolution /sendText: status 400 — Connection Closed"), false},
		{"sendMedia 400 + disc",   fmt.Errorf("evolution sendMedia status 400: disconnected"), false},
		{"sendMedia 400 + not connected", fmt.Errorf("evolution sendMedia status 400: instance is not connected"), false},
		{"instance not found",     fmt.Errorf("evolution sendText status 404: instance not found"), false},
		// Ban-indicativos — DEVEM contar para quarentena
		{"sendMedia 400 + logout", fmt.Errorf("evolution sendMedia status 400: logged out"), true},
		{"evolution 401",          fmt.Errorf("evolution sendText status 401"),             true},
		{"evolution 403",          fmt.Errorf("evolution sendText status 403"),             true},
		{"generic wha error",      errors.New("whatsapp session closed by remote"),         true},
		{"unknown 4xx",            fmt.Errorf("evolution sendText status 410"),             true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isBanIndicativeError(tc.err)
			if got != tc.wantBan {
				t.Errorf("isBanIndicativeError(%v) = %v, want %v", tc.err, got, tc.wantBan)
			}
		})
	}
}

// TestRenderTemplateBody_NullPriceOriginal_DoesNotRender verifica que renderTemplateBodyV2
// retorna erro quando price_original é NULL — evita disparo "190→190 (0% OFF)".
func TestRenderTemplateBody_NullPriceOriginal_DoesNotRender(t *testing.T) {
	body := "{titulo}: caiu de {preco_de} para {preco_por} ({desconto}% OFF)"

	out, err := renderTemplateBodyV2(
		body,
		"Fone Bluetooth",
		sql.NullFloat64{}, // Valid=false → NULL
		190.0,
		0.0,
		"https://x.y/z",
	)
	if err == nil {
		t.Fatalf("esperado erro para price_original=NULL e desconto=0, got %q", out)
	}
}

// TestRenderTemplateBody_PriceOriginalLessEqual_DoesNotRender verifica que renderTemplateBodyV2
// retorna erro quando price_original <= price_current — desconto seria zero ou negativo.
func TestRenderTemplateBody_PriceOriginalLessEqual_DoesNotRender(t *testing.T) {
	body := "{titulo}: caiu de {preco_de} para {preco_por} ({desconto}% OFF)"

	out, err := renderTemplateBodyV2(
		body,
		"Item",
		sql.NullFloat64{Float64: 190.0, Valid: true}, // original == current
		190.0,
		0.0,
		"https://x/y",
	)
	if err == nil {
		t.Fatalf("esperado erro para original==current, got %q", out)
	}
}

// TestRenderTemplateBody_ValidDiscount_RendersCorrect verifica que renderTemplateBodyV2
// interpola corretamente quando há desconto válido.
func TestRenderTemplateBody_ValidDiscount_RendersCorrect(t *testing.T) {
	body := "{titulo}: de {preco_de} por {preco_por} ({desconto}% OFF)"

	out, err := renderTemplateBodyV2(
		body,
		"Item",
		sql.NullFloat64{Float64: 250.0, Valid: true},
		190.0,
		24.0,
		"https://x/y",
	)
	if err != nil {
		t.Fatalf("não esperava erro, got %v", err)
	}

	expected := "Item: de 250,00 por 190,00 (24% OFF)"
	if out != expected {
		t.Errorf("got=%q want=%q", out, expected)
	}
}
