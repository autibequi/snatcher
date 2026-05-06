package pipeline

import (
	"regexp"
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var (
	reSpaces    = regexp.MustCompile(`\s+`)
	reNonAlnum  = regexp.MustCompile(`[^a-z0-9\s]`)
	reWeights   = regexp.MustCompile(`\b\d+\s*(kg|g|ml|l|lbs?)\b`)
	reSizes     = regexp.MustCompile(`\b(p|m|g|gg|xg|xxg|pp|xs|s|xl|xxl|xxxl)\b`)

	stopWords = map[string]bool{
		"de": true, "da": true, "do": true, "das": true, "dos": true,
		"e": true, "ou": true, "com": true, "em": true, "para": true,
		"por": true, "um": true, "uma": true, "os": true, "as": true,
		"a": true, "o": true, "no": true, "na": true, "nos": true, "nas": true,
		"the": true, "of": true, "and": true, "for": true, "in": true, "with": true,
	}
)

// Deaccent remove acentos e diacríticos de uma string.
func Deaccent(s string) string {
	t := transform.Chain(norm.NFD, transform.RemoveFunc(func(r rune) bool {
		return unicode.Is(unicode.Mn, r)
	}), norm.NFC)
	result, _, _ := transform.String(t, s)
	return result
}

// NormalizeTitle normaliza um título de produto para comparação.
// Equivalente ao _normalize_title() do Python.
func NormalizeTitle(s string) string {
	s = Deaccent(s)
	s = strings.ToLower(s)
	s = reNonAlnum.ReplaceAllString(s, " ")
	s = reSpaces.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)

	words := strings.Fields(s)
	filtered := words[:0]
	for _, w := range words {
		if !stopWords[w] && len(w) > 1 {
			filtered = append(filtered, w)
		}
	}
	return strings.Join(filtered, " ")
}

// FuzzyMatch retorna true se a similaridade entre a e b (Levenshtein normalizado) >= threshold.
// difflib.SequenceMatcher usa Ratcliff/Obershelp, mas Levenshtein normalizado é suficiente
// para o caso de uso (produtos com small edits).
func FuzzyMatch(a, b string, threshold float64) bool {
	if a == b {
		return true
	}
	la, lb := len([]rune(a)), len([]rune(b))
	if la == 0 || lb == 0 {
		return false
	}
	dist := levenshtein([]rune(a), []rune(b))
	maxLen := la
	if lb > maxLen {
		maxLen = lb
	}
	sim := 1.0 - float64(dist)/float64(maxLen)
	return sim >= threshold
}

func levenshtein(a, b []rune) int {
	la, lb := len(a), len(b)
	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			del := prev[j] + 1
			ins := curr[j-1] + 1
			sub := prev[j-1] + cost
			curr[j] = min3(del, ins, sub)
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

func min3(a, b, c int) int {
	if a < b {
		if a < c {
			return a
		}
		return c
	}
	if b < c {
		return b
	}
	return c
}

// ExtractWeight extrai o peso de um título (ex: "900g", "1.5kg").
func ExtractWeight(title string) string {
	m := reWeights.FindString(strings.ToLower(title))
	return strings.TrimSpace(m)
}

// ExtractVariantLabel extrai label de variante (sabor, cor) de um título.
// Procura por tokens após " - " ou " | ".
func ExtractVariantLabel(title string) string {
	for _, sep := range []string{" - ", " | ", " / "} {
		if idx := strings.Index(title, sep); idx != -1 {
			label := strings.TrimSpace(title[idx+len(sep):])
			if label != "" && len(label) < 60 {
				return label
			}
		}
	}
	return ""
}

// EnrichTags adiciona categorias canônicas detectadas no título às tags originais,
// retornando uma lista deduplicada e ordenada.
func EnrichTags(title string, originalTags []string) []string {
	seen := map[string]bool{}
	for _, t := range originalTags {
		if t == "" {
			continue
		}
		seen[t] = true
	}
	for _, c := range MatchCategories(title) {
		seen[c] = true
	}
	out := make([]string, 0, len(seen))
	for t := range seen {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}
