package handlers

import (
	"net/http"

	"snatcher/backendv2/internal/compose"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
)

// ComposeHandler implementa POST /api/compose/preview.
type ComposeHandler struct {
	store store.Store
	svc   *compose.Service
}

// NewComposeHandler cria um ComposeHandler com store e compose.Service injetados.
func NewComposeHandler(st store.Store, svc *compose.Service) *ComposeHandler {
	return &ComposeHandler{store: st, svc: svc}
}

type composePreviewRequest struct {
	ProductID *int64 `json:"product_id"`
	ChannelID *int64 `json:"channel_id"`
	// Campos manuais (usados quando product_id não é fornecido)
	Title       string  `json:"title"`
	Marketplace string  `json:"marketplace"`
	Price       float64 `json:"price"`
	PriceOrig   float64 `json:"price_original"`
	Drop        float64 `json:"drop"`
	Category    string  `json:"category"`
	Brand       string  `json:"brand"`
}

// Preview godoc
//
//	POST /api/compose/preview
//
// Body: { product_id?, channel_id?, title?, marketplace?, price?, price_original?, drop?, category?, brand? }
// Retorna Suggestion com text, hashtags, emoji_set, media_suggestion, cached.
func (h *ComposeHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var req composePreviewRequest
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "body invalido")
		return
	}

	// Hidratar campos do produto a partir do catálogo se product_id fornecido.
	if req.ProductID != nil {
		if variant, err := h.store.GetCatalogVariant(*req.ProductID); err == nil {
			if req.Title == "" {
				req.Title = variant.Title
			}
			if req.Price == 0 {
				req.Price = variant.Price
			}
			if req.Marketplace == "" {
				req.Marketplace = variant.Source
			}
		}
	}

	if req.Title == "" {
		writeErr(w, http.StatusBadRequest, "title ou product_id obrigatorio")
		return
	}

	// Hidratar canal se channel_id fornecido.
	var ch *models.Channel
	if req.ChannelID != nil {
		if c, err := h.store.GetChannel(*req.ChannelID); err == nil {
			_ = c.UnmarshalAudience()
			ch = &c
		}
	}

	prod := compose.ProductInput{
		Title:       req.Title,
		Marketplace: req.Marketplace,
		Price:       req.Price,
		PriceOrig:   req.PriceOrig,
		Drop:        req.Drop,
		Category:    req.Category,
		Brand:       req.Brand,
	}

	suggestion, err := h.svc.Preview(r.Context(), prod, ch)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao gerar preview")
		return
	}
	writeJSON(w, http.StatusOK, suggestion)
}
