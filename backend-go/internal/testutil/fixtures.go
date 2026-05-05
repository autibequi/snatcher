package testutil

import (
	"database/sql"
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

// NewCatalogProduct insere um CatalogProduct mínimo (canonical_name único).
func NewCatalogProduct(t *testing.T, st store.Store, overrides ...models.CatalogProduct) models.CatalogProduct {
	t.Helper()
	p := models.CatalogProduct{
		CanonicalName: "produto-teste-" + uniq(),
		Brand:         models.NullString{NullString: sql.NullString{String: "TestBrand", Valid: true}},
		Weight:        models.NullString{NullString: sql.NullString{String: "900g", Valid: true}},
		Tags:          "[]",
	}
	if len(overrides) > 0 {
		o := overrides[0]
		if o.CanonicalName != "" {
			p.CanonicalName = o.CanonicalName
		}
		if o.Brand.Valid {
			p.Brand = o.Brand
		}
	}
	id, err := st.CreateCatalogProduct(p)
	if err != nil {
		t.Fatalf("CreateCatalogProduct: %v", err)
	}
	p.ID = id
	return p
}

// NewChannel cria um Channel ativo com slug único.
func NewChannel(t *testing.T, st store.Store, overrides ...models.Channel) models.Channel {
	t.Helper()
	suffix := uniq()
	c := models.Channel{
		Name:            "Canal " + suffix,
		MessageTemplate: models.NullString{NullString: sql.NullString{String: "{title} - {price}", Valid: true}},
		SendStartHour:   8,
		SendEndHour:     22,
		Active:          true,
	}
	if len(overrides) > 0 && overrides[0].Name != "" {
		c.Name = overrides[0].Name
	}
	id, err := st.CreateChannel(c)
	if err != nil {
		t.Fatalf("CreateChannel: %v", err)
	}
	c.ID = id
	return c
}
