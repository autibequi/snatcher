package store

import "snatcher/backendv2/internal/models"

// FilterCatalogProductsForAutoMatch applies the optional policy auto_match_only_curated:
// quando true, só produtos com curation_status curated ou auto entram no ciclo (alinhado ao catálogo filtrado).
func FilterCatalogProductsForAutoMatch(products []models.CatalogProduct, onlyCurated bool) []models.CatalogProduct {
	if !onlyCurated {
		return products
	}
	out := make([]models.CatalogProduct, 0, len(products))
	for _, p := range products {
		switch p.CurationStatus {
		case "curated", "auto":
			out = append(out, p)
		default:
			continue
		}
	}
	return out
}
