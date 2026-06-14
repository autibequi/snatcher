package selection

import (
	"testing"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/target"
)

// toRankedCandidates converte []Candidate para []RankedCandidate usando rankWithReasons,
// permitindo comparar os resultados da função canônica e do Rank legado nos testes.
func toRankedCandidates(cands []Candidate, tcfg target.Config, ch models.ChannelV2) []RankedCandidate {
	return rankWithReasons(cands, tcfg, ch)
}

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

// TestDryRunMatchesTick verifica que a função canônica (rankWithReasons) produz os
// mesmos resultados que o Rank legado para o mesmo conjunto de candidatos.
// Garante que dry-run e tick usam a mesma lógica de seleção.
func TestDryRunMatchesTick(t *testing.T) {
	ch := models.ChannelV2{ID: 1, QualityThreshold: 0, PriceMin: f64(50), PriceMax: f64(500)}
	tcfg := target.Config{Categories: []int64{1, 2}, PriceMin: 50, PriceMax: 500}

	cands := []Candidate{
		{CatalogID: 10, CategoryID: 1, Price: 100, Title: "A", QualityScore: 0.9, DiscountPct: 30},
		{CatalogID: 11, CategoryID: 9, Price: 100, Title: "B fora-categoria", QualityScore: 0.95},
		{CatalogID: 12, CategoryID: 2, Price: 1000, Title: "C caro", QualityScore: 0.99},
		{CatalogID: 13, CategoryID: 2, Price: 200, Title: "D", QualityScore: 0.5, DiscountPct: 10},
	}

	// tick usa Rank (via selectAndEnqueueForGroup → agora rankWithReasons internamente)
	tickRanked := Rank(cands, tcfg, ch)
	// dry-run usa rankWithReasons via SelectCandidatesForGroup
	dryRunRanked := toRankedCandidates(cands, tcfg, ch)

	if len(tickRanked) != len(dryRunRanked) {
		t.Fatalf("contagem diverge: tick=%d dry-run=%d", len(tickRanked), len(dryRunRanked))
	}

	if len(tickRanked) == 0 {
		t.Fatal("esperava pelo menos um candidato")
	}

	// top-1 deve ser o mesmo
	if tickRanked[0].CatalogID != dryRunRanked[0].CatalogID {
		t.Errorf("top-1 diverge: tick=%d dry-run=%d", tickRanked[0].CatalogID, dryRunRanked[0].CatalogID)
	}

	// scores devem ser iguais
	for i := range tickRanked {
		if tickRanked[i].Score != dryRunRanked[i].Score {
			t.Errorf("score[%d] diverge: tick=%f dry-run=%f", i, tickRanked[i].Score, dryRunRanked[i].Score)
		}
		if tickRanked[i].CatalogID != dryRunRanked[i].CatalogID {
			t.Errorf("catalogID[%d] diverge: tick=%d dry-run=%d", i, tickRanked[i].CatalogID, dryRunRanked[i].CatalogID)
		}
	}
}
