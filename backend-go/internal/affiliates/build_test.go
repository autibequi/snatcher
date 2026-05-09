package affiliates

import (
	"encoding/json"
	"testing"

	"snatcher/backendv2/internal/models"
)

func TestCanonicalAffiliateMarketplace(t *testing.T) {
	tests := []struct{ in, want string }{
		{"amz", "amazon"},
		{"amazon", "amazon"},
		{"ml", "mercadolivre"},
		{"mercadolivre", "mercadolivre"},
		{"shopee", "shopee"},
	}
	for _, tt := range tests {
		if got := CanonicalAffiliateMarketplace(tt.in); got != tt.want {
			t.Errorf("CanonicalAffiliateMarketplace(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestHasAffiliate_amzMatchesAmazonProgram(t *testing.T) {
	creds, _ := json.Marshal(map[string]string{"tag": "mytag-20"})
	progs := []models.AffiliateProgram{
		{
			Marketplace: "amazon",
			Active:      true,
			Credentials: creds,
		},
	}
	if !HasAffiliate("amz", progs) {
		t.Fatal("expected amz to match programa marketplace amazon")
	}
	if !HasAffiliate("amazon", progs) {
		t.Fatal("expected amazon to match")
	}
	if HasAffiliate("mercadolivre", progs) {
		t.Fatal("mercadolivre should not match amazon program")
	}
}

func TestInferMarketplaceFromProductURL(t *testing.T) {
	tests := []struct{ url, want string }{
		{"https://www.amazon.com.br/dp/B00TEST", "amazon"},
		{"https://lista.mercadolivre.com.br/x", "mercadolivre"},
		{"https://click.mlcdn.com.br/LP/PT/X/123/PNhttps%3A%2F%2Fprod", "mercadolivre"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := InferMarketplaceFromProductURL(tt.url); got != tt.want {
			t.Errorf("InferMarketplaceFromProductURL(%q) = %q, want %q", tt.url, got, tt.want)
		}
	}
}

func TestHasAffiliate_skipsInactive(t *testing.T) {
	creds, _ := json.Marshal(map[string]string{"tag": "x"})
	progs := []models.AffiliateProgram{
		{Marketplace: "amazon", Active: false, Credentials: creds},
	}
	if HasAffiliate("amazon", progs) {
		t.Fatal("inactive program must not count")
	}
}
