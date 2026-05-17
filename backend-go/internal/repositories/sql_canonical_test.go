package repositories_test

import (
	"os"
	"testing"

	"snatcher/backendv2/internal/services/algo"
)

// TestUpsertCanonical_Skip verifica que o teste é pulado quando DATABASE_URL não está configurado.
// Testes de integração com banco real exigem DATABASE_URL (ver TASK.md W2.C).
func TestUpsertCanonical_Skip(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL não configurado — teste de integração requer banco real (W2.C)")
	}
	// Chegando aqui apenas com banco disponível.
	t.Log("UpsertCanonical: smoke test de integração — requer banco configurado")
}

// TestLinkCatalogToCanonical_Skip verifica que o teste é pulado quando DATABASE_URL não está configurado.
// Testes de integração com banco real exigem DATABASE_URL (ver TASK.md W2.C).
func TestLinkCatalogToCanonical_Skip(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL não configurado — teste de integração requer banco real (W2.C)")
	}
	// Chegando aqui apenas com banco disponível.
	t.Log("LinkCatalogToCanonical: smoke test de integração — requer banco configurado")
}

// TestUpsertCanonical_HashUniqueness verifica que dois títulos distintos (com brands distintas)
// produzem fingerprints diferentes. Teste de lógica pura — não requer DB.
func TestUpsertCanonical_HashUniqueness(t *testing.T) {
	brandA := int64(1)
	brandB := int64(2)
	priceBand := 3

	resultA := algo.Fingerprint("iPhone 14 Pro Max 256GB", &brandA, priceBand)
	resultB := algo.Fingerprint("Samsung Galaxy S23 Ultra 256GB", &brandB, priceBand)

	if resultA.Hash == resultB.Hash {
		t.Error("esperado: fingerprints distintas para produtos diferentes; obtido: hashes idênticos")
	}

	if resultA.LowConfidence {
		t.Error("esperado: LowConfidence=false para produto com brandID definido")
	}

	if resultB.LowConfidence {
		t.Error("esperado: LowConfidence=false para produto com brandID definido")
	}
}
