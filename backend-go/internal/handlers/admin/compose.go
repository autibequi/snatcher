package admin

import (
	"context"
	"encoding/json"
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
	// Tom da mensagem e contexto customizado
	Tone          string `json:"tone"`
	CustomContext string `json:"custom_context"`
}

// hydrateComposePricesFromCatalog preenche price / price_original / drop quando lowest_price do produto
// está vazio mas há variantes com preço (ou metadata com original_price).
func hydrateComposePricesFromCatalog(st store.Store, productID int64, req *composePreviewRequest, p models.CatalogProduct) {
	variants, err := st.ListVariantsByProduct(productID)
	if err != nil {
		variants = nil
	}
	if len(variants) > 0 {
		_ = st.HydrateVariantPricesFromHistory(variants)
		p = store.MergeEffectiveLowestPrice(p, variants)
	}

	if req.Price <= 0 && p.LowestPrice.Valid && p.LowestPrice.Float64 > 0 {
		req.Price = p.LowestPrice.Float64
	}
	if req.Price <= 0 && len(variants) > 0 {
		var min float64
		for _, v := range variants {
			if v.Price <= 0 {
				continue
			}
			if min == 0 || v.Price < min {
				min = v.Price
			}
		}
		if min > 0 {
			req.Price = min
		}
	}

	if req.PriceOrig <= 0 && len(variants) > 0 {
		var maxOrig float64
		for _, v := range variants {
			var meta models.CrawlMetadata
			if len(v.Metadata) > 0 {
				_ = json.Unmarshal(v.Metadata, &meta)
			}
			if meta.OriginalPrice > v.Price && meta.OriginalPrice > maxOrig {
				maxOrig = meta.OriginalPrice
			}
		}
		if maxOrig > 0 && req.Price > 0 && maxOrig > req.Price {
			req.PriceOrig = maxOrig
		}
	}

	if req.Drop <= 0 && req.PriceOrig > 0 && req.Price > 0 && req.PriceOrig > req.Price {
		req.Drop = (req.PriceOrig - req.Price) / req.PriceOrig * 100
	}
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
			if req.Title == "" {
				req.Title = p.CanonicalName
			}
			if req.Marketplace == "" && p.LowestPriceSource.Valid {
				req.Marketplace = p.LowestPriceSource.String
			}
			if req.Brand == "" && p.Brand.Valid {
				req.Brand = p.Brand.String
			}
			if req.Category == "" {
				tags := p.GetTags()
				if len(tags) > 0 {
					req.Category = tags[0]
				}
			}
			hydrateComposePricesFromCatalog(h.store, *req.ProductID, &req, p)
		} else if variant, err := h.store.GetCatalogVariant(*req.ProductID); err == nil {
			if req.Title == "" {
				req.Title = variant.Title
			}
			if req.Price == 0 {
				req.Price = variant.Price
			}
			if req.Marketplace == "" {
				req.Marketplace = variant.Source
			}
			if cp, err := h.store.GetCatalogProduct(variant.CatalogProductID); err == nil {
				hydrateComposePricesFromCatalog(h.store, variant.CatalogProductID, &req, cp)
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
	if provider == "" {
		provider = "openrouter"
	}
	apiKey := cfg.LLMApiKey.String
	model := cfg.LLMModel.String

	var cli llm.Client
	switch strings.ToLower(provider) {
	case "ollama":
		baseURL := firstNonEmptyTrimmed(
			nullString(cfg.LLMOllamaBaseURL),
			nullString(cfg.LLMBaseURL),
		)
		baseURL = normalizeLLMBaseURL(baseURL)
		if baseURL == "" {
			return nil
		}
		m := firstNonEmptyTrimmed(nullString(cfg.LLMOllamaModel), nullString(cfg.LLMModel))
		if !strings.HasSuffix(baseURL, "/v1") && !strings.Contains(baseURL, "/v1/") {
			baseURL = strings.TrimRight(baseURL, "/") + "/v1"
		}
		c := llm.NewOpenAICompat(baseURL, "").WithReasoning(cfg.LLMReasoningOllama)
		if m != "" {
			cli = &modelOverrideClient{inner: c, model: m}
		} else {
			cli = c
		}
	case "vllm":
		baseURL := firstNonEmptyTrimmed(
			nullString(cfg.LLMVLLMBaseURL),
			nullString(cfg.LLMBaseURL),
		)
		baseURL = normalizeLLMBaseURL(baseURL)
		if baseURL == "" {
			return nil
		}
		m := firstNonEmptyTrimmed(nullString(cfg.LLMVLLMModel), nullString(cfg.LLMModel))
		vk := firstNonEmptyTrimmed(nullString(cfg.LLMVLLMApiKey), nullString(cfg.LLMApiKey))
		if !strings.HasSuffix(baseURL, "/v1") && !strings.Contains(baseURL, "/v1/") {
			baseURL = strings.TrimRight(baseURL, "/") + "/v1"
		}
		c := llm.NewOpenAICompat(baseURL, vk).WithReasoning(cfg.LLMReasoningVllm)
		if m != "" {
			cli = &modelOverrideClient{inner: c, model: m}
		} else {
			cli = c
		}
	case "openrouter":
		if apiKey == "" {
			return nil
		}
		c := llm.NewOpenAICompat("https://openrouter.ai/api/v1", apiKey).WithReasoning(cfg.LLMReasoningOpenrouter)
		if fb := strings.TrimSpace(nullString(cfg.LLMOpenRouterFallbackModel)); fb != "" {
			c = c.WithOpenRouterFallback(fb)
		}
		if model != "" {
			cli = &modelOverrideClient{inner: c, model: model}
		} else {
			cli = c
		}
	default:
		fallback := normalizeLLMBaseURL(cfg.LLMBaseURL.String)
		if fallback != "" {
			u := strings.ToLower(fallback)
			var re bool
			switch {
			case strings.Contains(u, "openrouter.ai"):
				re = cfg.LLMReasoningOpenrouter
			case strings.Contains(u, "vllm"):
				re = cfg.LLMReasoningVllm
			default:
				re = cfg.LLMReasoningOllama
			}
			cli = llm.NewOpenAICompat(fallback, apiKey).WithReasoning(re)
		}
	}
	return wrapLLMTemperature(cli, cfg)
}

// wrapLLMTemperature aplica temperatura global quando configurada em appconfig (sobrescreve o YAML de cada prompt).
func wrapLLMTemperature(inner llm.Client, cfg models.AppConfig) llm.Client {
	if inner == nil || !cfg.LLMTemperature.Valid {
		return inner
	}
	t := cfg.LLMTemperature.Float64
	if t < 0 || t > 2 {
		return inner
	}
	return &temperatureOverrideClient{inner: inner, temp: t}
}

// temperatureOverrideClient força opts.Temperature em toda chamada (OpenAI-compat).
type temperatureOverrideClient struct {
	inner llm.Client
	temp  float64
}

func (t *temperatureOverrideClient) Complete(ctx context.Context, prompt string, opts llm.Options) (string, error) {
	opts.Temperature = t.temp
	return t.inner.Complete(ctx, prompt, opts)
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
