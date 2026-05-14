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

	// BeautifyTitle — padrões de lixo a remover
	reBracketed   = regexp.MustCompile(`\[[^\]]{0,40}\]`)
	reParenJunk   = regexp.MustCompile(`(?i)\s*[\(\[]?(produto nacional|com\s+nf|sem\s+juros|importado|original|garantia|c\/nf|s\/juros|parcelado)[\)\]]?\s*`)
	rePipeVariant = regexp.MustCompile(`\s*\|.*$`)
	reTrailPunct  = regexp.MustCompile(`[\s,\-–—:;/|]+$`)
	reMultiSpace  = regexp.MustCompile(`\s{2,}`)

	// palavras que ficam minúsculas em Title Case (artigos/prep em PT-BR e EN)
	titleLower = map[string]bool{
		"de": true, "da": true, "do": true, "das": true, "dos": true,
		"e": true, "ou": true, "com": true, "em": true, "para": true,
		"por": true, "a": true, "o": true, "no": true, "na": true,
		"nos": true, "nas": true, "the": true, "of": true, "and": true,
		"for": true, "in": true, "with": true, "to": true, "at": true,
	}

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

// BeautifyTitle limpa e formata um título de produto para exibição em anúncios.
// Remove lixo de marketplace, aplica Title Case inteligente e limita comprimento.
func BeautifyTitle(title string, maxLen int) string {
	s := title

	// 1. Remove códigos entre colchetes ex: [ABC-123]
	s = reBracketed.ReplaceAllString(s, "")

	// 2. Remove badges comuns de marketplace ex: (Produto Nacional)
	s = reParenJunk.ReplaceAllString(s, "")

	// 3. Remove tudo depois de " | " (variante/subtítulo extra)
	s = rePipeVariant.ReplaceAllString(s, "")

	// 4. Limpa pontuação/espaços no final
	s = reTrailPunct.ReplaceAllString(s, "")
	s = reMultiSpace.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)

	// 5. Title Case inteligente — lowercasa tudo, depois capitaliza a 1ª letra
	//    exceto artigos/preposições (que ficam minúsculos no meio)
	words := strings.Fields(s)
	for i, w := range words {
		lower := strings.ToLower(w)
		if i == 0 || !titleLower[lower] {
			r := []rune(lower)
			if len(r) > 0 {
				r[0] = unicode.ToUpper(r[0])
				words[i] = string(r)
			}
		} else {
			words[i] = lower
		}
	}
	s = strings.Join(words, " ")

	// 6. Trunca em maxLen (palavra inteira)
	if maxLen > 0 && len([]rune(s)) > maxLen {
		runes := []rune(s)
		s = string(runes[:maxLen])
		// Recua até último espaço para não cortar no meio de palavra
		if idx := strings.LastIndex(s, " "); idx > maxLen/2 {
			s = s[:idx]
		}
		s = strings.TrimRight(s, " ,.-") + "…"
	}

	return s
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
	return FuzzyScore(a, b) >= threshold
}

// FuzzyScore retorna a similaridade Levenshtein normalizada entre a e b (0..1).
// 0 = nada em comum, 1 = idênticos. Útil pra zonas de confiança no merge.
func FuzzyScore(a, b string) float64 {
	if a == b {
		return 1.0
	}
	la, lb := len([]rune(a)), len([]rune(b))
	if la == 0 || lb == 0 {
		return 0.0
	}
	dist := levenshtein([]rune(a), []rune(b))
	maxLen := la
	if lb > maxLen {
		maxLen = lb
	}
	return 1.0 - float64(dist)/float64(maxLen)
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

// MatchesWordBoundary verifica se keyword aparece em text com word boundary.
// Evita falsos positivos como "Acer" em "Racer" ou "LG" em "LEG".
// Usa \b do RE2 (ASCII word boundary: [a-zA-Z0-9_]).
func MatchesWordBoundary(text, keyword string) bool {
	if keyword == "" {
		return false
	}
	pattern := `(?i)\b` + regexp.QuoteMeta(keyword) + `\b`
	matched, err := regexp.MatchString(pattern, text)
	return err == nil && matched
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

// CleanTitle remove ocorrências da marca do título (case-insensitive, whole word)
// e colapsa espaços. Útil quando a marca é exibida separadamente como pill.
func CleanTitle(title, brand string) string {
	if title == "" || brand == "" {
		return title
	}
	re, err := regexp.Compile(`(?i)\b` + regexp.QuoteMeta(brand) + `\b`)
	if err != nil {
		return title
	}
	cleaned := re.ReplaceAllString(title, "")
	cleaned = reSpaces.ReplaceAllString(cleaned, " ")
	return strings.TrimSpace(cleaned)
}

// reQuantity captura tamanhos, pesos, volumes e contagens de produtos.
var reQuantity = regexp.MustCompile(`(?i)\b(\d+(?:[.,]\d+)?)\s*(kg|g|mg|ml|l|lts?|litros?|lb|lbs|oz|caps?|cáps?|cápsulas?|comprimidos?|tabs?|sachê|sachês|unid|unidades?|pares?|pçs?|packs?|pack|kits?|peças?|pcs?|metros?|m2|cm|mm)\b`)

// ExtractQuantity extrai tamanho/medida/quantidade de um título de produto.
// Retorna a primeira ocorrência normalizada (ex: "900g", "2kg", "30 cáps").
func ExtractQuantity(title string) string {
	m := reQuantity.FindString(title)
	return strings.TrimSpace(m)
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
