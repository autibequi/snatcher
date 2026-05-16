package senders

import (
	"database/sql"
	"testing"
)

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
