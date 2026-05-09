package store

import (
	"database/sql"

	"snatcher/backendv2/internal/models"
)

// MergeEffectiveLowestPrice preenche lowest_price/url/source (e imagem se vazia)
// a partir da variante mais barata com price > 0.
func MergeEffectiveLowestPrice(p models.CatalogProduct, variants []models.CatalogVariant) models.CatalogProduct {
	var best *models.CatalogVariant
	for i := range variants {
		v := &variants[i]
		if v.Price <= 0 {
			continue
		}
		if best == nil || v.Price < best.Price {
			best = v
		}
	}
	if best == nil {
		return p
	}
	p.LowestPrice = models.NullFloat64{NullFloat64: sql.NullFloat64{Float64: best.Price, Valid: true}}
	if best.URL != "" {
		p.LowestPriceURL = models.NullString{NullString: sql.NullString{String: best.URL, Valid: true}}
	}
	if best.Source != "" {
		p.LowestPriceSource = models.NullString{NullString: sql.NullString{String: best.Source, Valid: true}}
	}
	if !p.ImageURL.Valid && best.ImageURL.Valid {
		p.ImageURL = best.ImageURL
	}
	return p
}
