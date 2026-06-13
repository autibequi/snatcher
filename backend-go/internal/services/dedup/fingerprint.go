package dedup

import (
	"crypto/md5"
	"encoding/binary"
	"regexp"
	"strings"
)

var stopwordsPTBR = map[string]struct{}{
	"de": {}, "a": {}, "o": {}, "que": {}, "e": {}, "do": {}, "da": {}, "em": {},
	"para": {}, "com": {}, "por": {}, "na": {}, "no": {}, "um": {}, "uma": {}, "os": {}, "as": {},
}

// FingerprintResult é o retorno tipado de Fingerprint.
type FingerprintResult struct {
	Hash          [16]byte
	LowConfidence bool // true quando brandID == nil; evitar agregação cross-marketplace
}

// Fingerprint produz hash 16-byte determinístico baseado em title + brand + price_band.
// LowConfidence é true quando brandID é nil, sinalizando ao caller que a agregação
// cross-marketplace deve ser evitada.
func Fingerprint(title string, brandID *int64, priceBand int) FingerprintResult {
	tokens := tokenize(title)
	shingles := makeShingles(tokens, 3)
	minHash := computeMinHash(shingles, 128)

	var out [16]byte
	h := md5.New()
	for _, mh := range minHash {
		_ = binary.Write(h, binary.LittleEndian, mh)
	}
	if brandID != nil {
		_ = binary.Write(h, binary.LittleEndian, *brandID)
	}
	_ = binary.Write(h, binary.LittleEndian, int64(priceBand))
	copy(out[:], h.Sum(nil))
	return FingerprintResult{Hash: out, LowConfidence: brandID == nil}
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9 ]+`)

func tokenize(s string) []string {
	s = strings.ToLower(s)
	s = nonAlnum.ReplaceAllString(s, " ")
	raw := strings.Fields(s)
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		if _, stop := stopwordsPTBR[t]; stop {
			continue
		}
		if len(t) < 2 {
			continue
		}
		out = append(out, t)
	}
	return out
}

func makeShingles(tokens []string, k int) []string {
	if len(tokens) < k {
		return []string{strings.Join(tokens, " ")}
	}
	out := make([]string, 0, len(tokens)-k+1)
	for i := 0; i <= len(tokens)-k; i++ {
		out = append(out, strings.Join(tokens[i:i+k], " "))
	}
	return out
}

func computeMinHash(shingles []string, numHashes int) []uint64 {
	minHashes := make([]uint64, numHashes)
	for i := range minHashes {
		minHashes[i] = ^uint64(0)
	}
	for _, sh := range shingles {
		h := md5.Sum([]byte(sh))
		for k := 0; k < numHashes; k++ {
			seed := uint64(k) * 0x9E3779B97F4A7C15
			v := binary.LittleEndian.Uint64(h[:8]) ^ seed
			if v < minHashes[k] {
				minHashes[k] = v
			}
		}
	}
	return minHashes
}
