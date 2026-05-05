package eval

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
)

// Scorer define métodos de validação para casos de teste.
type Scorer struct{}

// ExactMatch verifica se output é exatamente igual a expected.
func (s *Scorer) ExactMatch(output, expected string) bool {
	return strings.TrimSpace(output) == strings.TrimSpace(expected)
}

// SchemaValid valida se output é JSON válido.
func (s *Scorer) SchemaValid(output string) bool {
	var obj map[string]any
	return json.Unmarshal([]byte(output), &obj) == nil
}

// ContainsKeywords verifica se output contém todas as keywords (case-insensitive).
func (s *Scorer) ContainsKeywords(output string, keywords []string) bool {
	if len(keywords) == 0 {
		return true
	}
	lower := strings.ToLower(output)
	for _, kw := range keywords {
		if !strings.Contains(lower, strings.ToLower(kw)) {
			return false
		}
	}
	return true
}

// RegexMatch verifica se output faz match com um padrão regex.
func (s *Scorer) RegexMatch(output, pattern string) bool {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}
	return re.MatchString(output)
}

// JSONExtract extrai um campo JSON do output.
// path é formato simples: "field" ou "nested.field"
func (s *Scorer) JSONExtract(output, path string) (any, error) {
	var obj map[string]any
	if err := json.Unmarshal([]byte(output), &obj); err != nil {
		return nil, err
	}

	parts := strings.Split(path, ".")
	var current any = obj

	for _, part := range parts {
		if m, ok := current.(map[string]any); ok {
			current = m[part]
		} else {
			return nil, nil
		}
	}
	return current, nil
}

// CosineSimilarity calcula a similaridade cosseno entre dois vetores.
// Implementação simplificada: aproximação via comprimento de string + overlap.
func (s *Scorer) CosineSimilarity(a, b string) float64 {
	// Simplificado: usa Jaccard similarity (|A∩B| / |A∪B|)
	// Para embeddings reais, teríamos que chamar OpenAI text-embedding-3-small

	aLower := strings.ToLower(a)
	bLower := strings.ToLower(b)

	if aLower == bLower {
		return 1.0
	}

	// Tokenizar por espaço
	aTokens := tokenize(aLower)
	bTokens := tokenize(bLower)

	// Contar intersecção
	intersect := 0
	for _, tok := range aTokens {
		for _, btok := range bTokens {
			if tok == btok {
				intersect++
				break
			}
		}
	}

	// Contar união
	unionLen := len(aTokens) + len(bTokens) - intersect
	if unionLen == 0 {
		return 0
	}

	return float64(intersect) / float64(unionLen)
}

// tokenize divide um texto em tokens por espaço e remove pontuação.
func tokenize(text string) []string {
	text = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' {
			return r
		}
		return ' '
	}, text)
	return strings.Fields(text)
}

// LatencyPercentile calcula um percentil de latências.
func LatencyPercentile(latencies []int64, percentile float64) float64 {
	if len(latencies) == 0 {
		return 0
	}
	if percentile < 0 || percentile > 100 {
		percentile = 50
	}

	// Ordenar array (simplificado: apenas para pequenos N)
	sorted := make([]int64, len(latencies))
	copy(sorted, latencies)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j] < sorted[i] {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	idx := (percentile / 100.0) * float64(len(sorted)-1)
	lower := int(math.Floor(idx))
	upper := int(math.Ceil(idx))

	if lower == upper {
		return float64(sorted[lower])
	}

	// Interpolação linear
	fraction := idx - float64(lower)
	return float64(sorted[lower])*(1-fraction) + float64(sorted[upper])*fraction
}
