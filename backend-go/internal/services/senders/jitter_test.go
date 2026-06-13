package senders

import (
	"testing"
	"time"
)

// TestJitter_WithinBounds verifica que jitter() retorna um delta dentro do intervalo
// [-pct*base, +pct*base] em 100 chamadas consecutivas.
// Função `jitter` definida em dispatcher.go (package senders, unexported).
func TestJitter_WithinBounds(t *testing.T) {
	const base = 90 * time.Second
	const pct = 0.33
	const iterations = 100

	lowerBound := -time.Duration(float64(base) * pct)
	upperBound := time.Duration(float64(base) * pct)

	for i := 0; i < iterations; i++ {
		delta := jitter(base, pct)
		if delta < lowerBound || delta > upperBound {
			t.Errorf(
				"iter %d: jitter(%v, %.2f) = %v fora do intervalo [%v, %v]",
				i, base, pct, delta, lowerBound, upperBound,
			)
		}
	}
}

// TestJitter_ZeroPct — pct=0 deve sempre retornar zero.
func TestJitter_ZeroPct(t *testing.T) {
	const base = 60 * time.Second
	const iterations = 20

	for i := 0; i < iterations; i++ {
		delta := jitter(base, 0)
		if delta != 0 {
			t.Errorf("iter %d: jitter com pct=0 deve ser 0, got %v", i, delta)
		}
	}
}

// TestJitter_DistributionSymmetric — em 1000 amostras, média deve estar próxima de zero
// (|média| < 20% do upperBound). Não é um teste determinístico — falhas esporádicas
// são possíveis mas extremamente improváveis com 1000 amostras.
func TestJitter_DistributionSymmetric(t *testing.T) {
	const base = 90 * time.Second
	const pct = 0.33
	const iterations = 1000

	var sum float64
	for i := 0; i < iterations; i++ {
		sum += float64(jitter(base, pct))
	}
	mean := sum / iterations
	upperBound := float64(base) * pct

	tolerance := upperBound * 0.20
	if mean < -tolerance || mean > tolerance {
		t.Errorf(
			"distribuição muito assimétrica: média=%.0fms, tolerância=±%.0fms",
			mean/float64(time.Millisecond),
			tolerance/float64(time.Millisecond),
		)
	}
}
