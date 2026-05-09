package admin

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
	Title         string  `json:"title"`
	Marketplace   string  `json:"marketplace"`
	Price         float64 `json:"price"`
	PriceOrig     float64 `json:"price_original"`
	Drop          float64 `json:"drop"`
	Category      string  `json:"category"`
	Brand         string  `json:"brand"`
	// Tom da mensagem e contexto customizado
	Tone          string  `json:"tone"`
	CustomContext string  `json:"custom_context"`
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
		Title:         req.Title,
		Marketplace:   req.Marketplace,
		Price:         req.Price,
		PriceOrig:     req.PriceOrig,
		Drop:          req.Drop,
		Category:      req.Category,
		Brand:         req.Brand,
		Tone:          req.Tone,
		CustomContext: req.CustomContext,
	}

	// Usar cliente LLM dinâmico baseado na config atual do banco
	svc := h.svc
	if dynClient := h.buildDynamicLLMClient(); dynClient != nil {
		svc = compose.NewService(dynClient)
	}

	suggestion, err := svc.Preview(r.Context(), prod, ch)
	if err != nil {
		// Retornar o erro real para diagnóstico no frontend
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, suggestion)
}

// buildDynamicLLMClient lê a config do banco e cria o cliente LLM adequado.
// Retorna nil se não houver config válida (handler usa o svc padrão / fallback).
// BuildLLMClient retorna o LLM client configurado no banco (exportado para reuso no CurationHandler).
func (h *ComposeHandler) BuildLLMClient() llm.Client {
	return h.buildDynamicLLMClient()
}

func (h *ComposeHandler) buildDynamicLLMClient() llm.Client {
	cfg, err := h.store.GetConfig()
	if err != nil {
		return nil
	}
	provider := cfg.LLMProvider.String
	if provider == "" { provider = "openrouter" }
	apiKey := cfg.LLMApiKey.String
	model := cfg.LLMModel.String

	switch strings.ToLower(provider) {
	case "ollama":
		baseURL := firstNonEmptyTrimmed(
			nullString(cfg.LLMOllamaBaseURL),
			nullString(cfg.LLMBaseURL),
		)
		baseURL = normalizeLLMBaseURL(baseURL)
		if baseURL == "" { return nil }
		m := firstNonEmptyTrimmed(nullString(cfg.LLMOllamaModel), nullString(cfg.LLMModel))
		if !strings.HasSuffix(baseURL, "/v1") && !strings.Contains(baseURL, "/v1/") {
			baseURL = strings.TrimRight(baseURL, "/") + "/v1"
		}
		cli := llm.NewOpenAICompat(baseURL, "").WithReasoning(cfg.LLMReasoningEnabled)
		if m != "" {
			return &modelOverrideClient{inner: cli, model: m}
		}
		return cli
	case "vllm":
		baseURL := firstNonEmptyTrimmed(
			nullString(cfg.LLMVLLMBaseURL),
			nullString(cfg.LLMBaseURL),
		)
		baseURL = normalizeLLMBaseURL(baseURL)
		if baseURL == "" { return nil }
		m := firstNonEmptyTrimmed(nullString(cfg.LLMVLLMModel), nullString(cfg.LLMModel))
		vk := firstNonEmptyTrimmed(nullString(cfg.LLMVLLMApiKey), nullString(cfg.LLMApiKey))
		if !strings.HasSuffix(baseURL, "/v1") && !strings.Contains(baseURL, "/v1/") {
			baseURL = strings.TrimRight(baseURL, "/") + "/v1"
		}
		cli := llm.NewOpenAICompat(baseURL, vk).WithReasoning(cfg.LLMReasoningEnabled)
		if m != "" {
			return &modelOverrideClient{inner: cli, model: m}
		}
		return cli
	case "openrouter":
		if apiKey == "" { return nil }
		cli := llm.NewOpenAICompat("https://openrouter.ai/api/v1", apiKey).WithReasoning(cfg.LLMReasoningEnabled)
		if fb := strings.TrimSpace(nullString(cfg.LLMOpenRouterFallbackModel)); fb != "" {
			cli = cli.WithOpenRouterFallback(fb)
		}
		if model != "" {
			return &modelOverrideClient{inner: cli, model: model}
		}
		return cli
	default:
		fallback := normalizeLLMBaseURL(cfg.LLMBaseURL.String)
		if fallback != "" {
			return llm.NewOpenAICompat(fallback, apiKey).WithReasoning(cfg.LLMReasoningEnabled)
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
