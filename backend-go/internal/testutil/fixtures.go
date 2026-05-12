package testutil

import (
	"fmt"
	"sync/atomic"
	"testing"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

var fixtureSeq uint64

// uniq devolve um sufixo único na sessão de teste, garantindo que múltiplas
// fixtures não colidam em campos UNIQUE.
func uniq() string {
	return fmt.Sprintf("%d-%d", atomic.AddUint64(&fixtureSeq, 1), 1000)
}

// NewSearchTerm cria um SearchTerm com defaults razoáveis. Campos passados em
// overrides[0] (se fornecido) sobrescrevem.
func NewSearchTerm(t *testing.T, st store.Store, overrides ...models.SearchTerm) models.SearchTerm {
	t.Helper()
	term := models.SearchTerm{
		Query:         "whey-" + uniq(),
		Queries:       "[]",
		MinVal:        50,
		MaxVal:        200,
		Sources:       "all",
		Active:        true,
		CrawlInterval: 30,
	}
	if len(overrides) > 0 {
		merged := overrides[0]
		if merged.Query != "" {
			term.Query = merged.Query
		}
		if merged.Sources != "" {
			term.Sources = merged.Sources
		}
		term.Active = merged.Active || term.Active
		if merged.CrawlInterval > 0 {
			term.CrawlInterval = merged.CrawlInterval
		}
	}
	id, err := st.CreateSearchTerm(term)
	if err != nil {
		t.Fatalf("CreateSearchTerm: %v", err)
	}
	term.ID = id
	return term
}
