package match

import (
	"regexp"
	"strings"
	"sync"
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

type CompiledPattern struct {
	TaxonomyID   int64
	TaxonomyType string  // category, brand, color, size, voltage, capacity
	TaxonomySlug string
	Kind         string          // word_boundary, regex, exact_keyword, etc
	Regex        *regexp.Regexp  // compilado pra qualquer kind
	Weight       float64
	Exclude      bool            // true se kind='exclude_regex' ou 'exclude_keyword'
	ParentID     *int64          // parent_id da taxonomy (pra distinguir primary vs sub)
}

type TaxonomyHit struct {
	TaxonomyID   int64
	TaxonomyType string
	TaxonomySlug string
	ParentID     *int64  // parent_id da taxonomy
	MatchedValue string
	Confidence   float64
}

type PatternCache struct {
	mu       sync.RWMutex
	compiled []CompiledPattern
	version  time.Time // = max(updated_at) de taxonomy_pattern
}

func NewPatternCache() *PatternCache {
	return &PatternCache{}
}

// Refresh recarrega patterns do store se versão mudou
func (pc *PatternCache) Refresh(st store.Store) error {
	maxUpdated, err := st.MaxTaxonomyPatternUpdatedAt()
	if err != nil {
		return err
	}

	pc.mu.RLock()
	upToDate := !pc.version.IsZero() && !maxUpdated.After(pc.version)
	pc.mu.RUnlock()
	if upToDate {
		return nil
	}

	patterns, err := st.ListAllActivePatterns()
	if err != nil {
		return err
	}

	compiled := make([]CompiledPattern, 0, len(patterns))
	for _, p := range patterns {
		rgx, exclude := compilePattern(p)
		if rgx == nil {
			continue
		}

		// Buscar metadata da taxonomy (TaxonomyType, TaxonomySlug, ParentID)
		// Assumindo que store.GetTaxonomy(id) existe. Criar se não existir.
		taxData, err := st.GetTaxonomy(p.TaxonomyID)
		if err != nil || taxData == nil {
			continue // skip se não conseguir carregar taxonomy
		}

		// Convert NullInt64 to *int64
		var parentID *int64
		if taxData.ParentID.Valid {
			parentID = &taxData.ParentID.Int64
		}

		compiled = append(compiled, CompiledPattern{
			TaxonomyID:   p.TaxonomyID,
			TaxonomyType: taxData.Type,
			TaxonomySlug: taxData.Slug,
			Kind:         p.Kind,
			Regex:        rgx,
			Weight:       p.Weight,
			Exclude:      exclude,
			ParentID:     parentID,
		})
	}

	pc.mu.Lock()
	pc.compiled = compiled
	pc.version = maxUpdated
	pc.mu.Unlock()
	return nil
}

// compilePattern transforma value+kind em regex compilada
func compilePattern(p models.TaxonomyPattern) (*regexp.Regexp, bool) {
	val := p.Value
	var pattern string
	var exclude bool
	switch p.Kind {
	case "exact_keyword":
		pattern = "(?i)^" + regexp.QuoteMeta(val) + "$"
	case "contains_keyword":
		pattern = "(?i)" + regexp.QuoteMeta(val)
	case "word_boundary":
		pattern = "(?i)\\b" + regexp.QuoteMeta(val) + "\\b"
	case "regex":
		pattern = "(?i)" + val
	case "exclude_keyword":
		pattern = "(?i)\\b" + regexp.QuoteMeta(val) + "\\b"
		exclude = true
	case "exclude_regex":
		pattern = "(?i)" + val
		exclude = true
	default:
		return nil, false
	}
	rgx, err := regexp.Compile(pattern)
	if err != nil {
		return nil, false
	}
	return rgx, exclude
}

// MatchAllPatterns aplica todos patterns ao texto e retorna hits, descartando excludes que batem
func (pc *PatternCache) MatchAllPatterns(text string) []TaxonomyHit {
	text = strings.ToLower(strings.TrimSpace(text))
	pc.mu.RLock()
	defer pc.mu.RUnlock()

	// Primeira passada: identifica taxonomies com exclude que bateu (descartar essas)
	excluded := map[int64]bool{}
	for _, p := range pc.compiled {
		if p.Exclude && p.Regex.MatchString(text) {
			excluded[p.TaxonomyID] = true
		}
	}

	// Segunda passada: hits positivos não-excluídos
	hits := make([]TaxonomyHit, 0)
	seen := map[int64]bool{}
	for _, p := range pc.compiled {
		if p.Exclude {
			continue
		}
		if excluded[p.TaxonomyID] {
			continue
		}
		if seen[p.TaxonomyID] {
			continue // 1 hit por taxonomy
		}
		if loc := p.Regex.FindStringIndex(text); loc != nil {
			hits = append(hits, TaxonomyHit{
				TaxonomyID:   p.TaxonomyID,
				TaxonomyType: p.TaxonomyType,
				TaxonomySlug: p.TaxonomySlug,
				ParentID:     p.ParentID,
				MatchedValue: text[loc[0]:loc[1]],
				Confidence:   p.Weight,
			})
			seen[p.TaxonomyID] = true
		}
	}
	return hits
}
