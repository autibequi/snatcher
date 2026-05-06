package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/store"
)

// RunLLMCurationWorker categoriza produtos com curation_status='pending' usando LLM.
// Processa até 20 produtos por ciclo para controlar custos.
func RunLLMCurationWorker(ctx context.Context, st store.Store, cli llm.Client) error {
	pending, err := st.ListPendingCurationProducts(20)
	if err != nil {
		return fmt.Errorf("llm curation: list pending: %w", err)
	}
	if len(pending) == 0 {
		return nil
	}

	categorized := 0
	for _, p := range pending {
		prompt := fmt.Sprintf(`Você é um especialista em e-commerce brasileiro.
Dado o nome de produto abaixo, responda SOMENTE um JSON com os campos:
- category: categoria principal em português (ex: "Suplementos", "Smartphones", "Tênis")
- brand: marca do produto (ex: "Growth", "Samsung", "Nike") ou null se não identificado
- quantity: tamanho/quantidade/medida (ex: "900g", "128GB", "Par") ou null se não aplicável

Nome: %s

Responda apenas o JSON, sem markdown nem texto extra.`, p.CanonicalName)

		resp, err := cli.Complete(ctx, prompt, llm.Options{
			MaxTokens:   80,
			Temperature: 0.1,
			Operation:   "curation",
		})
		if err != nil {
			slog.Warn("llm curation: skip product", "id", p.ID, "err", err)
			continue
		}

		resp = strings.TrimSpace(resp)
		resp = strings.TrimPrefix(resp, "```json")
		resp = strings.TrimPrefix(resp, "```")
		resp = strings.TrimSuffix(resp, "```")
		resp = strings.TrimSpace(resp)

		var result struct {
			Category string  `json:"category"`
			Brand    *string `json:"brand"`
			Quantity *string `json:"quantity"`
		}
		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			slog.Warn("llm curation: parse error", "id", p.ID, "resp", resp)
			continue
		}

		if result.Category != "" {
			tags := p.GetTags()
			tags = append(tags, result.Category)
			p.SetTags(tags)
			p.CurationStatus = "curated"
			categorized++
		}
		if result.Brand != nil && *result.Brand != "" {
			p.Brand.String = *result.Brand
			p.Brand.Valid = true
		}
		if result.Quantity != nil && *result.Quantity != "" && p.Quantity == "" {
			p.Quantity = *result.Quantity
		}
		_ = st.UpdateCatalogProduct(p)
	}

	slog.Info("llm curation: done", "processed", len(pending), "categorized", categorized)
	return nil
}
