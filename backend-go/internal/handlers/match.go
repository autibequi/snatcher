package handlers

import (
	"net/http"

	"snatcher/backendv2/internal/match"
	"snatcher/backendv2/internal/models"
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
// Retorna lista de grupos ranqueados por score desc, top 50.
// Cada entrada inclui members_count, channel_ctr, historical_ctr_here e discount_threshold.
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
		product.Name = cp.CanonicalName
		if product.Brand == "" && cp.Brand.Valid {
			product.Brand = cp.Brand.String
		}
		if product.Price == 0 && cp.LowestPrice.Valid {
			product.Price = cp.LowestPrice.Float64
		}
		if product.Category == "" {
			tags := cp.GetTags()
			if len(tags) > 0 {
				product.Category = tags[0]
			}
		}
	}

	// Carregar todos os grupos ativos (platform="" e status="" para todos).
	groups, err := h.store.ListRedesignGroups(0, "", "active")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar grupos")
		return
	}

	// Carregar canais e montar mapa channel_id → Channel para O(1) lookup.
	channels, err := h.store.ListChannels()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar canais")
		return
	}
	channelByID := make(map[int64]models.Channel, len(channels))
	for _, ch := range channels {
		channelByID[ch.ID] = ch
	}

	scores := match.RankGroups(product, groups, channelByID)

	// Enriquecer com historical_ctr_here (be-02): query por grupo+categoria.
	// Executado após ranking para evitar queries em grupos com score=0.
	for i := range scores {
		ctr, err := h.store.GetHistoricalCTRForGroup(scores[i].GroupID, product.Category, 5)
		if err == nil {
			scores[i].HistoricalCTRHere = ctr
		}
		// erro silenciado: campo fica nil, não bloqueia o response
	}

	writeJSON(w, http.StatusOK, scores)
}
