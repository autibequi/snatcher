//go:build property

package algo_test

import (
	"testing"

	"snatcher/backendv2/internal/services/algo"
)

// brand helper.
func brandID(v int64) *int64 { return &v }

// TestFingerprintCrossMarketplaceDedup verifica que variações de capitalização e
// espaçamento de um mesmo título produzem o mesmo hash — base do dedup cross-marketplace
// para listagens do mesmo produto em plataformas distintas.
//
// Nota: MinHash opera em shingles de tokens normalizados. Variações de capitalização,
// pontuação e espaço extra são eliminadas pelo tokenizer. Variações de ORDEM de palavras
// ou tokens extras (ex: "Apple iPhone" vs "iPhone Apple") geram shingles distintos e
// portanto hashes distintos — isso é correto: produtos não são idênticos nesse sentido.
func TestFingerprintCrossMarketplaceDedup(t *testing.T) {
	// Mesmas palavras, capitalização diferente — todos tokenizam para
	// ["iphone", "15", "128gb", "preto"] → shingles idênticos → mesmo hash.
	titles := []struct {
		name  string
		title string
	}{
		{"Amazon listing", "iPhone 15 128GB Preto"},
		{"ML listing", "IPHONE 15 128GB PRETO"},
		{"Shopee listing", "iphone 15 128gb preto"},
		{"extra spaces", "iPhone  15  128GB  Preto"},
		{"mixed case with punctuation", "iPhone-15 128GB Preto!"},
	}

	brand := brandID(42)
	priceBand := 5

	ref := algo.Fingerprint(titles[0].title, brand, priceBand)
	if ref.LowConfidence {
		t.Fatalf("variante %q com brand definida: esperava LowConfidence=false, got true", titles[0].title)
	}

	for _, tt := range titles[1:] {
		got := algo.Fingerprint(tt.title, brand, priceBand)
		if got.Hash != ref.Hash {
			t.Errorf("dedup falhou para %q:\n  ref  (%q) = %x\n  got  (%q) = %x",
				tt.name, titles[0].title, ref.Hash, tt.title, got.Hash)
		}
		if got.LowConfidence {
			t.Errorf("%q com brand definida: esperava LowConfidence=false, got true", tt.name)
		}
	}
}

// TestFingerprintNoCollapseOnDifferentBrands garante que o mesmo título com brands
// diferentes produz hashes distintos — evita colapso incorreto de produtos homônimos
// de marcas concorrentes (ex: "Galaxy S23" da Samsung vs de um clone).
func TestFingerprintNoCollapseOnDifferentBrands(t *testing.T) {
	title := "smartphone galaxy s23 ultra 256gb"
	priceBand := 8

	brand1 := brandID(1001) // Samsung
	brand2 := brandID(1002) // clone

	h1 := algo.Fingerprint(title, brand1, priceBand)
	h2 := algo.Fingerprint(title, brand2, priceBand)

	if h1.Hash == h2.Hash {
		t.Errorf("brands distintas produziram mesmo hash %x — dedup incorreto", h1.Hash)
	}
	if h1.LowConfidence || h2.LowConfidence {
		t.Errorf("brand definida deve ter LowConfidence=false (h1=%v, h2=%v)", h1.LowConfidence, h2.LowConfidence)
	}
}

// TestFingerprintNoCollapseAcrossPriceBands garante que o mesmo título + brand com
// price bands diferentes produz hashes distintos — evita colapso de bundle vs unitário
// (ex: iPhone unitário vs kit com acessórios).
func TestFingerprintNoCollapseAcrossPriceBands(t *testing.T) {
	title := "notebook dell inspiron 15 8gb ssd 256"
	brand := brandID(500)

	bands := []int{1, 3, 5, 8} // faixas de preço distintas
	hashes := make([][16]byte, len(bands))
	for i, pb := range bands {
		hashes[i] = algo.Fingerprint(title, brand, pb).Hash
	}

	// Cada par deve ser distinto.
	for i := 0; i < len(hashes); i++ {
		for j := i + 1; j < len(hashes); j++ {
			if hashes[i] == hashes[j] {
				t.Errorf("priceBand %d e %d produziram mesmo hash %x — dedup incorreto",
					bands[i], bands[j], hashes[i])
			}
		}
	}
}

// TestFingerprintNilBrandLowConfidence verifica o contrato cross-marketplace:
// produto sem brand → LowConfidence=true → NÃO entra no índice UNIQUE parcial
// da tabela canonical_products (que filtra WHERE low_confidence = FALSE).
func TestFingerprintNilBrandLowConfidence(t *testing.T) {
	title := "produto generico sem marca xpto 123"
	priceBand := 3

	got := algo.Fingerprint(title, nil, priceBand)
	if !got.LowConfidence {
		t.Errorf("brandID=nil deve produzir LowConfidence=true, got false (título=%q)", title)
	}

	// Com brand definida, mesmo título → LowConfidence=false.
	withBrand := algo.Fingerprint(title, brandID(99), priceBand)
	if withBrand.LowConfidence {
		t.Errorf("brandID definida deve produzir LowConfidence=false, got true (título=%q)", title)
	}

	// Hashes devem ser diferentes (brand entra no MD5).
	if got.Hash == withBrand.Hash {
		t.Errorf("nil brand e brand=99 produziram mesmo hash — brand não está sendo incorporada ao hash")
	}
}
