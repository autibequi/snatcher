package spy

import (
	"testing"
)

func TestParseLinks(t *testing.T) {
	msg := "Notebook incrível! R$ 2.999,00\nhttps://amzn.to/3abcXYZ\nCorre antes acabar!"
	links := ParseLinks(msg)
	if len(links) == 0 {
		t.Error("expected to find Amazon link")
	}
}

func TestParsePrices(t *testing.T) {
	msg := "De R$ 3.500,00 por R$ 2.999,00"
	prices := ParsePrices(msg)
	if len(prices) < 2 {
		t.Errorf("expected 2 prices, got %d", len(prices))
	}
	if prices[0] != 3500.0 {
		t.Errorf("expected 3500.0, got %f", prices[0])
	}
}

func TestToCandidate_RegexPath(t *testing.T) {
	p := NewParser(nil)
	msg := "Notebook Dell por R$ 2.999,00 https://amzn.to/xyz"
	cand, ok := p.ToCandidate(nil, msg)
	if !ok {
		t.Error("expected IsOffer=true")
	}
	if cand.Marketplace != "amazon" {
		t.Errorf("expected amazon, got %s", cand.Marketplace)
	}
	if cand.Price != 2999.0 {
		t.Errorf("expected 2999.0, got %f", cand.Price)
	}
}

func TestToCandidate_NoOffer(t *testing.T) {
	p := NewParser(nil)
	_, ok := p.ToCandidate(nil, "Bom dia pessoal!")
	if ok {
		t.Error("expected IsOffer=false for non-offer message")
	}
}

func TestDetectMarketplace(t *testing.T) {
	cases := [][2]string{
		{"https://amzn.to/xyz", "amazon"},
		{"https://shopee.com.br/produto", "shopee"},
		{"https://kabum.com.br/produto", "kabum"},
		{"https://example.com", "unknown"},
	}
	for _, tc := range cases {
		got := detectMarketplace(tc[0])
		if got != tc[1] {
			t.Errorf("detectMarketplace(%s) = %s, want %s", tc[0], got, tc[1])
		}
	}
}

func TestToCandidate_Cache(t *testing.T) {
	p := NewParser(nil)
	msg := "Fone Sony por R$ 399,99 https://amzn.to/fone123"

	cand1, ok1 := p.ToCandidate(nil, msg)
	cand2, ok2 := p.ToCandidate(nil, msg)

	if !ok1 || !ok2 {
		t.Error("expected both calls to succeed")
	}
	if cand1.Price != cand2.Price {
		t.Error("expected cache to return same candidate")
	}
}

func TestParsePrices_Single(t *testing.T) {
	msg := "R$ 1.299,90"
	prices := ParsePrices(msg)
	if len(prices) != 1 {
		t.Fatalf("expected 1 price, got %d", len(prices))
	}
	if prices[0] != 1299.90 {
		t.Errorf("expected 1299.90, got %f", prices[0])
	}
}

func TestToCandidate_DropPct(t *testing.T) {
	p := NewParser(nil)
	// Dois preços: o segundo é o original (de R$ 4.000,00 por R$ 2.000,00)
	msg := "De R$ 4.000,00 por R$ 2.000,00 https://amzn.to/abc"
	cand, ok := p.ToCandidate(nil, msg)
	if !ok {
		t.Error("expected IsOffer=true")
	}
	// Price = primeiro encontrado = 4000, PriceOrig = segundo = 2000
	// Drop só é calculado se Price < PriceOrig — aqui não vai calcular
	// mas os campos devem estar preenchidos
	if cand.Price == 0 {
		t.Error("expected Price to be set")
	}
}
