package curation

import (
	"snatcher/backendv2/internal/store"
)

// taxonomyHit stub (internal/match foi removido em unify-v1-v2).
type taxonomyHit struct {
	TaxonomyID   int64
	Confidence   float64
	TaxonomyType string
}

type noopPatternCache struct{}

func (noopPatternCache) Refresh(_ store.Store) error          { return nil }
func (noopPatternCache) MatchAllPatterns(_ string) []taxonomyHit { return nil }

var patternCache = noopPatternCache{}

// ScriptConfidence retorna score baseado em keywords SQL (taxonomy_pattern removido com v1).
func ScriptConfidence(st store.Store, canonicalName string) (score float64, keywordTaxIDs []int64, patternHits []taxonomyHit, err error) {
	if canonicalName == "" {
		return 0, nil, nil, nil
	}
	keywordTaxIDs, err = st.DetectAndUpsertTaxonomy(canonicalName)
	if err != nil {
		return 0, nil, nil, err
	}
	if len(keywordTaxIDs) > 0 {
		score = 1.0
	}
	return score, keywordTaxIDs, nil, nil
}

// MergeTaxonomyIDs une IDs vindos de keywords sem duplicar.
func MergeTaxonomyIDs(keywordIDs []int64, hits []taxonomyHit) []int64 {
	seen := make(map[int64]bool, len(keywordIDs))
	out := make([]int64, 0, len(keywordIDs))
	for _, id := range keywordIDs {
		if id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}
