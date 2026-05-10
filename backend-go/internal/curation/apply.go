package curation

import (
	"strings"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
)

// NormalizeScriptConfidenceMin limiar para aplicar marca/categoria só com script (default 0.75).
func NormalizeScriptConfidenceMin(cfg models.AppConfig) float64 {
	v := cfg.CurationScriptConfidenceMin
	if v <= 0 || v > 1 {
		return 0.75
	}
	return v
}

// NormalizeLLMConfidenceThreshold abaixo disto o produto é elegível para LLM (default 0.65).
func NormalizeLLMConfidenceThreshold(cfg models.AppConfig) float64 {
	v := cfg.CurationLLMConfidenceThreshold
	if v <= 0 || v > 1 {
		return 0.65
	}
	return v
}

// NormalizeAutoMatchIntervalSeconds entre 15 e 3600.
func NormalizeAutoMatchIntervalSeconds(cfg models.AppConfig) int {
	v := cfg.AutoMatchIntervalSeconds
	if v <= 0 {
		return 60
	}
	if v < 15 {
		return 15
	}
	if v > 3600 {
		return 3600
	}
	return v
}

// NormalizeHeuristicIntervalSeconds entre 30 e 86400 (24h).
func NormalizeHeuristicIntervalSeconds(cfg models.AppConfig) int {
	v := cfg.CurationHeuristicIntervalSeconds
	if v <= 0 {
		return 120
	}
	if v < 30 {
		return 30
	}
	if v > 86400 {
		return 86400
	}
	return v
}

// NormalizeHeuristicBatchSize entre 50 e 2000.
func NormalizeHeuristicBatchSize(cfg models.AppConfig) int {
	v := cfg.CurationHeuristicBatchSize
	if v <= 0 {
		return 500
	}
	if v < 50 {
		return 50
	}
	if v > 2000 {
		return 2000
	}
	return v
}

// ApplyScriptCurator aplica quantity + tags/marca quando score >= limiar.
// Para cada taxonomy só por pattern (sem keyword SQL), incrementa detect_count.
func ApplyScriptCurator(st store.Store, p *models.CatalogProduct, cfg models.AppConfig) (score float64, applied bool, err error) {
	minScore := NormalizeScriptConfidenceMin(cfg)
	score, kwIDs, patHits, err := ScriptConfidence(st, p.CanonicalName)
	if err != nil {
		return 0, false, err
	}
	if score < minScore {
		return score, false, nil
	}

	kwSet := make(map[int64]bool, len(kwIDs))
	for _, id := range kwIDs {
		kwSet[id] = true
	}
	for _, h := range patHits {
		if kwSet[h.TaxonomyID] {
			continue
		}
		_ = st.IncrementTaxonomyDetect(h.TaxonomyID)
	}

	merged := MergeTaxonomyIDs(kwIDs, patHits)
	if len(merged) == 0 {
		return score, false, nil
	}

	taxEntries, err := st.GetTaxonomyByIDs(merged)
	if err != nil {
		return score, false, err
	}

	changed := false
	if p.Quantity == "" {
		if q := pipeline.ExtractQuantity(p.CanonicalName); q != "" {
			p.Quantity = q
			changed = true
		}
	}
	for _, t := range taxEntries {
		switch t.Type {
		case "brand":
			if !p.Brand.Valid || p.Brand.String == "" {
				p.Brand.String = t.Name
				p.Brand.Valid = true
				changed = true
			}
		case "category":
			tags := p.GetTags()
			found := false
			for _, tag := range tags {
				if strings.EqualFold(tag, t.Name) {
					found = true
					break
				}
			}
			if !found {
				p.SetTags(append(tags, t.Name))
				changed = true
			}
		}
	}
	if p.CurationStatus == "pending" {
		p.CurationStatus = "auto"
		changed = true
	}
	if changed {
		if err := st.UpdateCatalogProduct(*p); err != nil {
			return score, false, err
		}
		return score, true, nil
	}
	return score, false, nil
}

// NeedsLLMForCuration true quando o score script está abaixo do limiar (LLM deve ajudar).
func NeedsLLMForCuration(score float64, cfg models.AppConfig) bool {
	return score < NormalizeLLMConfidenceThreshold(cfg)
}
