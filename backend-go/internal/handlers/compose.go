package handlers

import (
	"context"
	"net/http"
	"strings"

	"snatcher/backendv2/internal/compose"
	"snatcher/backendv2/internal/llm"
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
	// Tenta CatalogProduct primeiro (ID do frontend), depois CatalogVariant (legado).
	if req.ProductID != nil {
		if p, err := h.store.GetCatalogProduct(*req.ProductID); err == nil {
			if req.Title == "" { req.Title = p.CanonicalName }
			if req.Price == 0 && p.LowestPrice.Valid { req.Price = p.LowestPrice.Float64 }
			if req.Marketplace == "" && p.LowestPriceSource.Valid { req.Marketplace = p.LowestPriceSource.String }
			if req.Brand == "" && p.Brand.Valid { req.Brand = p.Brand.String }
			if req.Category == "" {
				tags := p.GetTags()
				if len(tags) > 0 { req.Category = tags[0] }
			}
		} else if variant, err := h.store.GetCatalogVariant(*req.ProductID); err == nil {
			if req.Title == "" { req.Title = variant.Title }
			if req.Price == 0 { req.Price = variant.Price }
			if req.Marketplace == "" { req.Marketplace = variant.Source }
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

	// Usar cliente LLM dinâmico baseado na config atual do banco
	svc := h.svc
	if dynClient := h.buildDynamicLLMClient(); dynClient != nil {
		svc = compose.NewService(dynClient)
	}

	suggestion, err := svc.Preview(r.Context(), prod, ch)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao gerar preview")
		return
	}
	writeJSON(w, http.StatusOK, suggestion)
}

// buildDynamicLLMClient lê a config do banco e cria o cliente LLM adequado.
// Retorna nil se não houver config válida (handler usa o svc padrão / fallback).
func (h *ComposeHandler) buildDynamicLLMClient() llm.Client {
	cfg, err := h.store.GetConfig()
	if err != nil {
		return nil
	}
	provider := cfg.LLMProvider.String
	if provider == "" { provider = "openrouter" }
	apiKey  := cfg.LLMApiKey.String
	baseURL := cfg.LLMBaseURL.String
	model   := cfg.LLMModel.String

	switch strings.ToLower(provider) {
	case "ollama":
		if baseURL == "" { baseURL = "http://ollama:11434/v1" }
		// Ollama não precisa de API key
		cli := llm.NewOpenAICompat(baseURL, "")
		if model != "" {
			return &modelOverrideClient{inner: cli, model: model}
		}
		return cli
	case "openrouter":
		if apiKey == "" { return nil }
		cli := llm.NewOpenAICompat("https://openrouter.ai/api/v1", apiKey)
		if model != "" {
			return &modelOverrideClient{inner: cli, model: model}
		}
		return cli
	default:
		if baseURL != "" {
			return llm.NewOpenAICompat(baseURL, apiKey)
		}
		return nil
	}
}

// modelOverrideClient injeta o model em cada chamada sem mudar a interface.
type modelOverrideClient struct {
	inner llm.Client
	model string
}

func (m *modelOverrideClient) Complete(ctx context.Context, prompt string, opts llm.Options) (string, error) {
	opts.Model = m.model
	return m.inner.Complete(ctx, prompt, opts)
}
