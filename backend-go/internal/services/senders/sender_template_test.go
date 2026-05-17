package senders

import (
	"database/sql"
	"strings"
	"testing"
)

// TestRenderTemplateBody_190To190_Bug reproduz o bug onde renderTemplateBody (função legada)
// aceita price_original NULL e devolve "{preco_de}→{preco_por}" idênticos (ex: "190→190").
// RED: antes do fix, renderTemplateBody retorna a mensagem interpolada com precoDe==precoPor.
// GREEN: após o fix, renderTemplateBody retorna "" para sinalizar desconto inválido.
func TestRenderTemplateBody_190To190_Bug(t *testing.T) {
	body := "{titulo}: de {preco_de} por {preco_por} ({desconto}% OFF)"

	// Caso 1: price_original NULL → precoDe cai para precoPor → "190→190"
	t.Run("null_price_original_returns_empty", func(t *testing.T) {
		out := renderTemplateBody(
			body,
			"Fone Bluetooth",
			sql.NullFloat64{}, // Valid=false → NULL
			190.0,
			0.0,
			"https://x.y/z",
		)
		if out != "" {
			t.Errorf("renderTemplateBody com price_original=NULL deveria retornar \"\", got %q", out)
		}
		if strings.Contains(out, "190") && strings.Count(out, "190") >= 2 {
			t.Errorf("bug 190→190 presente: got %q", out)
		}
	})

	// Caso 2: price_original == price_current → desconto seria 0%
	t.Run("equal_prices_returns_empty", func(t *testing.T) {
		out := renderTemplateBody(
			body,
			"Fone Bluetooth",
			sql.NullFloat64{Float64: 190.0, Valid: true}, // original == current
			190.0,
			0.0,
			"https://x.y/z",
		)
		if out != "" {
			t.Errorf("renderTemplateBody com price_original==price_current deveria retornar \"\", got %q", out)
		}
	})

	// Caso 3: desconto zero com price_original válido mas igual ao atual
	t.Run("zero_discount_returns_empty", func(t *testing.T) {
		out := renderTemplateBody(
			body,
			"Item",
			sql.NullFloat64{Float64: 190.0, Valid: true},
			190.0,
			0.0,
			"https://x.y/z",
		)
		if out != "" {
			t.Errorf("renderTemplateBody com desconto zero deveria retornar \"\", got %q", out)
		}
	})

	// Caso 4 (positivo): desconto válido → deve interpolar normalmente
	t.Run("valid_discount_renders_correctly", func(t *testing.T) {
		out := renderTemplateBody(
			body,
			"Fone Bluetooth",
			sql.NullFloat64{Float64: 250.0, Valid: true},
			190.0,
			24.0,
			"https://x.y/z",
		)
		if out == "" {
			t.Fatal("renderTemplateBody com desconto válido não deve retornar \"\"")
		}
		expected := "Fone Bluetooth: de 250,00 por 190,00 (24% OFF)"
		if out != expected {
			t.Errorf("got=%q want=%q", out, expected)
		}
	})
}
