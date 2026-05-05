package prompts

import (
	"strings"
	"testing"
)

func TestRegistry_Active(t *testing.T) {
	r := NewRegistry()

	// compose v1 deve estar disponível
	p, err := r.Active("compose")
	if err != nil {
		t.Fatalf("Active(compose): %v", err)
	}
	if p.Operation != "compose" || p.Version != "v1" {
		t.Errorf("expected compose/v1, got %s/%s", p.Operation, p.Version)
	}
}

func TestPrompt_Render(t *testing.T) {
	r := NewRegistry()
	p, _ := r.Active("compose")

	type ProductData struct {
		Title       string
		Marketplace string
		Price       float64
		Drop        float64
	}
	type RenderData struct {
		Product ProductData
		Channel any
	}
	result, err := p.Render(RenderData{
		Product: ProductData{Title: "Notebook Lenovo", Marketplace: "Amazon", Price: 2999.99, Drop: 15},
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !strings.Contains(result, "Notebook Lenovo") {
		t.Errorf("rendered output missing product title")
	}
}

func TestRegistry_ParseOffer(t *testing.T) {
	r := NewRegistry()
	p, err := r.Active("parse_offer")
	if err != nil {
		t.Fatal(err)
	}

	type Data struct {
		RawMessage string
		Links      []string
	}
	out, err := p.Render(Data{RawMessage: "Notebook por R$ 2999!", Links: []string{"https://amazon.com.br/xyz"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "R$ 2999") {
		t.Error("expected message in rendered output")
	}
}
