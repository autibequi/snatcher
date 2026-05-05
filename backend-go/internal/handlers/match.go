package handlers

import (
	"net/http"

	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/store"
)

// MatchHandler implementa POST /api/match.
type MatchHandler struct {
	store store.Store
}

// NewMatchHandler cria um MatchHandler com o store injetado.
func NewMatchHandler(st store.Store) *MatchHandler {
	return &MatchHandler{store: st}
}

// Match godoc
//
//	POST /api/match
//
// Body: { product_id?, category?, brand?, price?, drop? }
// Retorna lista de canais ordenados por score desc, top 50.
func (h *MatchHandler) Match(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductID int64   `json:"product_id"`
		Category  string  `json:"category"`
		Brand     string  `json:"brand"`
		Price     float64 `json:"price"`
		Drop      float64 `json:"drop"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	product := match.ProductInput{
		Category: req.Category,
		Brand:    req.Brand,
		Price:    req.Price,
		Drop:     req.Drop,
	}

	// Se productID fornecido, hidratar a partir do CatalogProduct (nome, marca, preço).
	if req.ProductID > 0 {
		cp, err := h.store.GetCatalogProduct(req.ProductID)
		if err != nil {
			writeErr(w, http.StatusNotFound, "produto não encontrado")
			return
		}
		product.Name = cp.CanonicalName // título completo para match parcial
		if product.Brand == "" && cp.Brand.Valid {
			product.Brand = cp.Brand.String
		}
		if product.Price == 0 && cp.LowestPrice.Valid {
			product.Price = cp.LowestPrice.Float64
		}
		// Tags do produto como categorias adicionais
		if product.Category == "" {
			tags := cp.GetTags()
			if len(tags) > 0 {
				product.Category = tags[0]
			}
		}
	}

	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar canais")
		return
	}

	scores := match.RankChannels(product, channels)
	writeJSON(w, http.StatusOK, scores)
}
