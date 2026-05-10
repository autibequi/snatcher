package curation

import (
	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/store"
)

// Cache compartilhado entre workers — Refresh invalida quando taxonomy_pattern muda.
var patternCache = match.NewPatternCache()

// ScriptConfidence combina keywords SQL (approved) com taxonomy_pattern (pesos).
// Score final = max(1.0 se keyword match, max(weight) dos patterns).
func ScriptConfidence(st store.Store, canonicalName string) (score float64, keywordTaxIDs []int64, patternHits []match.TaxonomyHit, err error) {
	if canonicalName == "" {
		return 0, nil, nil, nil
	}
	keywordTaxIDs, err = st.DetectAndUpsertTaxonomy(canonicalName)
	if err != nil {
		return 0, nil, nil, err
	}
	if err := patternCache.Refresh(st); err != nil {
		return 0, keywordTaxIDs, nil, err
	}
	patternHits = patternCache.MatchAllPatterns(canonicalName)

	kwScore := 0.0
	if len(keywordTaxIDs) > 0 {
		kwScore = 1.0
	}
	maxPat := 0.0
	for _, h := range patternHits {
		if h.Confidence > maxPat {
			maxPat = h.Confidence
		}
	}
	score = kwScore
	if maxPat > score {
		score = maxPat
	}
	return score, keywordTaxIDs, patternHits, nil
}

// MergeTaxonomyIDs une IDs vindos de keywords e de hits de pattern sem duplicar.
func MergeTaxonomyIDs(keywordIDs []int64, hits []match.TaxonomyHit) []int64 {
	seen := make(map[int64]bool, len(keywordIDs)+len(hits))
	out := make([]int64, 0, len(keywordIDs)+len(hits))
	for _, id := range keywordIDs {
		if id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	for _, h := range hits {
		if h.TaxonomyID > 0 && !seen[h.TaxonomyID] {
			seen[h.TaxonomyID] = true
			out = append(out, h.TaxonomyID)
		}
	}
	return out
}
