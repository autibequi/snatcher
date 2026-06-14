package match

import (
	"testing"

	"snatcher/backendv2/internal/models"
)

func ptr[T any](v T) *T { return &v }

func TestScore_ZeroWhenBelowPriceMin(t *testing.T) {
	cat := CatalogItem{QualityScore: 0.8, PriceCurrent: 50.0, DiscountPct: 30.0}
	ch := models.ChannelV2{PriceMin: ptr(100.0)}
	r := Score(cat, ch)
	if r.Score != 0.0 {
		t.Fatalf("expected 0, got %f", r.Score)
	}
}

func TestScore_ZeroWhenAbovePriceMax(t *testing.T) {
	cat := CatalogItem{QualityScore: 0.8, PriceCurrent: 500.0, DiscountPct: 30.0}
	ch := models.ChannelV2{PriceMax: ptr(100.0)}
	r := Score(cat, ch)
	if r.Score != 0.0 {
		t.Fatalf("expected 0, got %f", r.Score)
	}
}

func TestScore_ZeroWhenDiscountBelowMin(t *testing.T) {
	cat := CatalogItem{QualityScore: 0.9, PriceCurrent: 100.0, DiscountPct: 5.0}
	ch := models.ChannelV2{MinDiscountPct: 20.0}
	r := Score(cat, ch)
	if r.Score != 0.0 {
		t.Fatalf("expected 0, got %f", r.Score)
	}
}

func TestScore_ReturnsQualityBase(t *testing.T) {
	cat := CatalogItem{QualityScore: 0.7, PriceCurrent: 150.0, DiscountPct: 10.0}
	ch := models.ChannelV2{}
	r := Score(cat, ch)
	if r.Score < 0.6 || r.Score > 0.8 {
		t.Fatalf("expected ~0.7, got %f", r.Score)
	}
	if len(r.Reasons) == 0 {
		t.Fatal("expected at least one reason")
	}
}

func TestScore_BonusForHighDiscount(t *testing.T) {
	cat := CatalogItem{QualityScore: 0.6, PriceCurrent: 100.0, DiscountPct: 25.0}
	ch := models.ChannelV2{}
	r := Score(cat, ch)
	// deal_score: 0.6 base + 25% * 0.30 = 0.675 (desconto progressivo, não mais binário)
	if r.Score < 0.67 || r.Score > 0.68 {
		t.Fatalf("expected ~0.675 (desconto progressivo), got %f", r.Score)
	}
}

func TestScore_BonusForAbsoluteSaving(t *testing.T) {
	ch := models.ChannelV2{}
	// Mesmo desconto %, mas economia absoluta em R$ muito maior → deve pontuar mais.
	pequeno := CatalogItem{QualityScore: 0.5, PriceCurrent: 100.0, PriceOriginal: 130.0, DiscountPct: 23.0}
	grande := CatalogItem{QualityScore: 0.5, PriceCurrent: 1000.0, PriceOriginal: 1300.0, DiscountPct: 23.0}
	if Score(grande, ch).Score <= Score(pequeno, ch).Score {
		t.Fatal("economia absoluta maior em R$ deveria pontuar mais que economia pequena")
	}
}

func TestScore_ClampedAt1(t *testing.T) {
	cat := CatalogItem{QualityScore: 0.95, PriceCurrent: 100.0, DiscountPct: 50.0}
	ch := models.ChannelV2{}
	r := Score(cat, ch)
	if r.Score > 1.0 {
		t.Fatalf("score must not exceed 1.0, got %f", r.Score)
	}
}

func BenchmarkScore(b *testing.B) {
	cat := CatalogItem{QualityScore: 0.75, PriceCurrent: 150.0, DiscountPct: 30.0}
	ch := models.ChannelV2{MinDiscountPct: 10.0}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Score(cat, ch)
	}
}
