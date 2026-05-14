package scheduler

import (
	"strings"
	"testing"
)

func TestSanitizeDispatchOutboundText_stripsMarketplaceKeepsShort(t *testing.T) {
	aff := "https://jon.promo/v/t6IMy6k"
	dom := "jon.promo"
	raw := `🔥 OFERTA

👉 https://www.amazon.com.br/dp/B0FN9DT79G

` + aff

	got := sanitizeDispatchOutboundText(raw, aff, dom)
	if strings.Contains(got, "amazon.") {
		t.Fatalf("amazon URL leaked: %q", got)
	}
	if !strings.Contains(got, "jon.promo") {
		t.Fatalf("short link missing: %q", got)
	}
}

func TestSanitizeDispatchOutboundText_appDomainOnly(t *testing.T) {
	s := "ver https://amazon.com/x e https://loja.com/v/abc"
	out := sanitizeDispatchOutboundText(s, "", "loja.com")
	if strings.Contains(out, "amazon") {
		t.Fatalf("amazon should be stripped: %q", out)
	}
	if !strings.Contains(out, "loja.com/v/abc") {
		t.Fatalf("allowed host missing: %q", out)
	}
}
