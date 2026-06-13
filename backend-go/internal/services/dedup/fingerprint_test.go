//go:build property

package dedup_test

import (
	"math/rand"
	"testing"

	"snatcher/backendv2/internal/services/dedup"
)

// TestFingerprintDeterminism verifica que Fingerprint é puro:
// mesmos inputs sempre produzem o mesmo hash (1000 iterações com seed fixo).
func TestFingerprintDeterminism(t *testing.T) {
	rng := rand.New(rand.NewSource(1337))

	const iterations = 1000
	titles := []string{
		"notebook dell inspiron 15 8gb ram ssd 256",
		"smartphone samsung galaxy s23 ultra",
		"",
		"a",
		"produto com acentuação especial ção",
		"PRODUTO EM MAIÚSCULAS 100% original",
	}

	for i := 0; i < iterations; i++ {
		// Selecionar título fixo por índice + título gerado aleatoriamente.
		var title string
		if rng.Intn(2) == 0 {
			title = titles[rng.Intn(len(titles))]
		} else {
			title = randomString(rng, 1+rng.Intn(80))
		}

		priceBand := rng.Intn(10)

		// brandID pode ser nil ou não-nil aleatoriamente.
		var brandID *int64
		if rng.Intn(2) == 0 {
			v := int64(rng.Intn(1000))
			brandID = &v
		}

		h1 := dedup.Fingerprint(title, brandID, priceBand)
		h2 := dedup.Fingerprint(title, brandID, priceBand)

		if h1.Hash != h2.Hash {
			t.Errorf("iter %d: determinismo violado: título=%q brandID=%v priceBand=%d → h1=%x h2=%x",
				i, title, brandID, priceBand, h1.Hash, h2.Hash)
		}
		if h1.LowConfidence != h2.LowConfidence {
			t.Errorf("iter %d: LowConfidence não-determinístico: h1=%v h2=%v",
				i, h1.LowConfidence, h2.LowConfidence)
		}
	}
}

// TestFingerprintLowConfidenceOnNilBrand verifica que brand_id == nil sempre
// produz LowConfidence=true, e brand_id não-nil produz LowConfidence=false.
func TestFingerprintLowConfidenceOnNilBrand(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	const iterations = 1000

	for i := 0; i < iterations; i++ {
		title := randomString(rng, rng.Intn(50))
		priceBand := rng.Intn(10)

		// nil → LowConfidence deve ser true.
		got := dedup.Fingerprint(title, nil, priceBand)
		if !got.LowConfidence {
			t.Errorf("iter %d: esperava LowConfidence=true com brandID=nil, got false (título=%q)", i, title)
		}

		// não-nil → LowConfidence deve ser false.
		v := int64(i + 1)
		got2 := dedup.Fingerprint(title, &v, priceBand)
		if got2.LowConfidence {
			t.Errorf("iter %d: esperava LowConfidence=false com brandID=%d, got true (título=%q)", i, v, title)
		}
	}
}

// TestFingerprintShortInputLowConfidence garante que inputs muito curtos (vazio ou 1 char)
// com brandID=nil retornam LowConfidence=true — cobertura do path de titulo degenerado.
func TestFingerprintShortInputLowConfidence(t *testing.T) {
	cases := []struct {
		title    string
		priceBand int
	}{
		{"", 0},
		{"a", 1},
		{" ", 2},
	}
	for _, c := range cases {
		got := dedup.Fingerprint(c.title, nil, c.priceBand)
		if !got.LowConfidence {
			t.Errorf("título=%q priceBand=%d: esperava LowConfidence=true, got false", c.title, c.priceBand)
		}
	}
}

// randomString gera uma string de comprimento n com bytes ASCII printáveis.
func randomString(rng *rand.Rand, n int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#"
	b := make([]byte, n)
	for i := range b {
		b[i] = charset[rng.Intn(len(charset))]
	}
	return string(b)
}
