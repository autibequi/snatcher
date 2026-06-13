package selection

import (
	"testing"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/target"
)

func f64(v float64) *float64 { return &v }

func TestRank_filtraEordena(t *testing.T) {
	ch := models.ChannelV2{ID: 1, QualityThreshold: 0, PriceMin: f64(50), PriceMax: f64(500)}
	tcfg := target.Config{Categories: []int64{1, 2}, PriceMin: 50, PriceMax: 500}

	cands := []Candidate{
		{CatalogID: 10, CategoryID: 1, Price: 100, Title: "A", QualityScore: 0.9, DiscountPct: 30},
		{CatalogID: 11, CategoryID: 9, Price: 100, Title: "B fora-categoria", QualityScore: 0.95}, // categoria fora → filtrado
		{CatalogID: 12, CategoryID: 2, Price: 1000, Title: "C caro", QualityScore: 0.99},          // preço acima → filtrado
		{CatalogID: 13, CategoryID: 2, Price: 200, Title: "D", QualityScore: 0.5, DiscountPct: 10},
	}

	got := Rank(cands, tcfg, ch)

	// Só 10 e 13 passam no filtro; 10 (quality 0.9) deve vir antes de 13 (quality 0.5).
	if len(got) != 2 {
		t.Fatalf("esperava 2 candidatos após filtro, obteve %d: %+v", len(got), got)
	}
	if got[0].CatalogID != 10 {
		t.Errorf("esperava CatalogID 10 no topo (maior score), obteve %d", got[0].CatalogID)
	}
	if got[1].CatalogID != 13 {
		t.Errorf("esperava CatalogID 13 em 2º, obteve %d", got[1].CatalogID)
	}
	if got[0].Score < got[1].Score {
		t.Errorf("ordenação incorreta: %f < %f", got[0].Score, got[1].Score)
	}
}

func TestRank_listaVazia(t *testing.T) {
	got := Rank(nil, target.Config{}, models.ChannelV2{})
	if len(got) != 0 {
		t.Errorf("lista vazia deve retornar vazio, obteve %d", len(got))
	}
}

func TestRank_blacklistFiltra(t *testing.T) {
	tcfg := target.Config{PriceMin: 0, Blacklist: []string{"usado"}}
	cands := []Candidate{
		{CatalogID: 1, CategoryID: 1, Price: 100, Title: "Notebook usado", QualityScore: 0.9},
		{CatalogID: 2, CategoryID: 1, Price: 100, Title: "Notebook novo", QualityScore: 0.8},
	}
	got := Rank(cands, tcfg, models.ChannelV2{})
	if len(got) != 1 || got[0].CatalogID != 2 {
		t.Errorf("blacklist 'usado' deveria deixar só o CatalogID 2, obteve %+v", got)
	}
}
