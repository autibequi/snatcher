package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
)

// Um único prompt LLM: curadoria (categoria/marca/tags) + auditoria pré-disparo (nome/marca/dispatch).
// Reduz tokens vs duas passagens separadas (AutoLLM + InspectAll).

const (
	unifiedInspectConfidenceMin = 0.85
	unifiedPerProductTimeout    = 90 * time.Second
	unifiedMaxTokens            = 14000
)

// unifiedLLMResponse espelha o JSON único esperado do modelo.
type unifiedLLMResponse struct {
	Category     *string `json:"category"`
	Brand        *string `json:"brand"`
	Quantity     *string `json:"quantity"`
	Flavor       *string `json:"flavor"`
	NewTaxonomies []struct {
		Type     string   `json:"type"`
		Name     string   `json:"name"`
		Keywords []string `json:"keywords"`
	} `json:"new_taxonomies"`

	ReadyForDispatch bool     `json:"ready_for_dispatch"`
	Issues           []string `json:"issues"`
	Summary          string   `json:"summary"`
	Confidence       float64  `json:"confidence"`

	Corrections struct {
		CanonicalName *string  `json:"canonical_name"`
		Brand         *string  `json:"brand"`
		RemoveBrand   bool     `json:"remove_brand"`
		AddTags       []string `json:"add_tags"`
		Quantity      *string  `json:"quantity"`
	} `json:"corrections"`
}

// UnifiedApplyStats contadores por produto para jobs.
type UnifiedApplyStats struct {
	Categorized      bool
	NewTaxonomyHints int
	HadCorrection    bool
	MarkedInspected  bool
}

func buildUnifiedCurationInspectPrompt(p *models.CatalogProduct) string {
	brand := ""
	if p.Brand.Valid {
		brand = p.Brand.String
	}
	extraCtx := ""
	if p.LowestPrice.Valid && p.LowestPrice.Float64 > 0 {
		extraCtx += fmt.Sprintf("\nPreço aproximado: R$ %.2f", p.LowestPrice.Float64)
	}
	if p.LowestPriceSource.Valid && p.LowestPriceSource.String != "" {
		extraCtx += "\nFonte: " + p.LowestPriceSource.String
	}
	if p.LowestPriceURL.Valid && p.LowestPriceURL.String != "" {
		extraCtx += "\nURL: " + p.LowestPriceURL.String
	}
	if p.ImageURL.Valid && p.ImageURL.String != "" {
		extraCtx += "\nImagem: " + p.ImageURL.String
	}

	tagsJSON := p.Tags
	if tagsJSON == "" {
		tagsJSON = "[]"
	}

	return fmt.Sprintf(`Você faz DUAS tarefas numa só resposta JSON:

(1) CURADORIA — especialista em e-commerce BR: inferir categoria principal, marca real, quantidade/tamanho, sabor se aplicável; sugerir novas entradas de taxonomia RECORRENTES.
(2) AUDITORIA PRÉ-DISPARO — validar se o produto pode ser anunciado em grupos de oferta WhatsApp/Telegram: nome legível, preço > 0, imagem; corrigir nome/marca quando a marca automática for FALSO POSITIVO (substring acidental: ex. "Acer" em "Fox Racer").

REGRAS DE MARCA (crítico):
- Se a marca NÃO aparece explicitamente no nome ou é sub-string acidental, use corrections.remove_brand=true.
- Seja LIBERAL em ready_for_dispatch — só false para risco real de engano ou dados inúteis para anúncio.

CONFIDENCE (obrigatório, número 0.0 a 1.0):
- Sua confiança CONJUNTA de que nome, marca, categoria e decisão de disparo estão corretas.
- Use >= %.2f SOMENTE se tiver alta certeza (marca confirmável no texto do produto, nome limpo, categoria coerente).
- Se houver dúvida razoável sobre marca ou categoria, use valor baixo (< %.2f) — o sistema NÃO marcará inspecionado automático.

PRODUTO:
- Nome: %s
- Marca atual (pode estar errada): %s
- Tags atuais (JSON): %s
- Quantidade no cadastro: %s
%s

Responda SOMENTE em JSON (sem markdown, sem <think>, sem prefácio):
{
  "category": "categoria principal em pt-BR ou null",
  "brand": "marca inferida ou null",
  "quantity": "tamanho/quantidade ou null",
  "flavor": "sabor se aplicável ou null",
  "new_taxonomies": [
    {"type": "brand|category|flavor|weight", "name": "Nome", "keywords": ["a","b"]}
  ],
  "ready_for_dispatch": true|false,
  "issues": [],
  "corrections": {
    "canonical_name": "nome limpo ou null",
    "brand": "marca correta se tiver certeza ou null",
    "remove_brand": false,
    "add_tags": [],
    "quantity": null
  },
  "confidence": 0.0,
  "summary": "uma frase única (curadoria + audit)"
}

ORDEM MENTAL: primeiro corrija nome/marca em corrections se necessário; category/brand no nível raiz refletem sua curadoria final coerente com essas correções.
Use URL/imagem como pistas — domínio da loja não é marca do produto.`,
		unifiedInspectConfidenceMin, unifiedInspectConfidenceMin,
		p.CanonicalName, brand, tagsJSON, p.Quantity, extraCtx)
}

func stripUnifiedJSON(raw string) string {
	resp := strings.TrimSpace(raw)
	if i := strings.Index(resp, "</think>"); i >= 0 {
		resp = strings.TrimSpace(resp[i+len("</think>"):])
	}
	resp = strings.TrimPrefix(resp, "```json")
	resp = strings.TrimPrefix(resp, "```")
	resp = strings.TrimSuffix(resp, "```")
	resp = strings.TrimSpace(resp)
	if start := strings.Index(resp, "{"); start > 0 {
		resp = resp[start:]
	}
	return resp
}

// ProcessProductUnified uma chamada LLM: curadoria + auditoria; marca inspected só com confiança alta.
func (h *CurationHandler) ProcessProductUnified(ctx context.Context, cli llm.Client, productID int64, operation string) (*UnifiedApplyStats, error) {
	if operation == "" {
		operation = "curation_inspect"
	}

	p, err := h.store.GetCatalogProduct(productID)
	if err != nil {
		return nil, err
	}

	prompt := buildUnifiedCurationInspectPrompt(p)

	callCtx, cancel := context.WithTimeout(ctx, unifiedPerProductTimeout)
	defer cancel()

	resp, err := cli.Complete(callCtx, prompt, llm.Options{
		MaxTokens:   unifiedMaxTokens,
		Temperature: 0.1,
		Operation:   operation,
		JSONMode:    true,
	})
	if err != nil {
		return nil, err
	}

	rawResp := resp
	resp = stripUnifiedJSON(resp)

	var result unifiedLLMResponse
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		llm.RecordHandlerError(operation, "", "handler parse: "+err.Error(), rawResp)
		return nil, fmt.Errorf("parse JSON: %w", err)
	}

	p, err = h.store.GetCatalogProduct(productID)
	if err != nil {
		return nil, err
	}

	stats := &UnifiedApplyStats{}
	oldName := p.CanonicalName

	// ── Correções de auditoria (nome/marca/tags) ─────────────────────────────
	if result.Corrections.CanonicalName != nil && *result.Corrections.CanonicalName != "" &&
		*result.Corrections.CanonicalName != p.CanonicalName {
		p.CanonicalName = *result.Corrections.CanonicalName
		stats.HadCorrection = true
	}

	if result.Corrections.RemoveBrand && p.Brand.Valid && p.Brand.String != "" {
		p.Brand = models.NullString{}
		stats.HadCorrection = true
	} else if result.Corrections.Brand != nil && *result.Corrections.Brand != "" {
		if !p.Brand.Valid || p.Brand.String != *result.Corrections.Brand {
			p.Brand.String = *result.Corrections.Brand
			p.Brand.Valid = true
			stats.HadCorrection = true
			h.ensureTaxonomyEntry("brand", *result.Corrections.Brand, oldName)
		}
	}

	if result.Corrections.Quantity != nil && *result.Corrections.Quantity != "" && p.Quantity == "" {
		p.Quantity = *result.Corrections.Quantity
		stats.HadCorrection = true
	}

	if len(result.Corrections.AddTags) > 0 {
		tags := p.GetTags()
		seen := map[string]bool{}
		for _, t := range tags {
			seen[strings.ToLower(t)] = true
		}
		for _, t := range result.Corrections.AddTags {
			if t != "" && !seen[strings.ToLower(t)] {
				tags = append(tags, t)
				seen[strings.ToLower(t)] = true
				stats.HadCorrection = true
				h.ensureTaxonomyEntry("category", t, oldName)
			}
		}
		p.SetTags(tags)
	}

	// ── Curadoria (nível raiz) — não sobrescreve marca se remove_brand já limpou ─────────
	if result.Corrections.RemoveBrand {
		// ignora brand raiz se pedimos limpar
	} else if result.Brand != nil && *result.Brand != "" && (!p.Brand.Valid || p.Brand.String == "") {
		p.Brand.String = *result.Brand
		p.Brand.Valid = true
		h.ensureTaxonomyEntry("brand", *result.Brand, p.CanonicalName)
	}

	if result.Category != nil && *result.Category != "" {
		tags := p.GetTags()
		tags = append(tags, *result.Category)
		p.SetTags(tags)
		if p.CurationStatus == "pending" {
			p.CurationStatus = "curated"
			stats.Categorized = true
		}
		if h.ensureTaxonomyEntry("category", *result.Category, p.CanonicalName) {
			stats.NewTaxonomyHints++
		}
	}

	if result.Flavor != nil && *result.Flavor != "" {
		if h.ensureTaxonomyEntry("flavor", *result.Flavor, p.CanonicalName) {
			stats.NewTaxonomyHints++
		}
		tags := p.GetTags()
		tags = append(tags, *result.Flavor)
		p.SetTags(tags)
	}

	if result.Quantity != nil && *result.Quantity != "" && p.Quantity == "" {
		p.Quantity = *result.Quantity
	}

	for _, nt := range result.NewTaxonomies {
		if nt.Type == "" || nt.Name == "" {
			continue
		}
		validTypes := map[string]bool{"brand": true, "category": true, "flavor": true, "weight": true, "color": true, "size": true, "quantity": true}
		if !validTypes[nt.Type] {
			continue
		}
		if len(nt.Keywords) == 0 {
			nt.Keywords = []string{strings.ToLower(nt.Name)}
		}
		if _, err := h.store.SuggestTaxonomyCandidate(nt.Type, nt.Name, nt.Keywords, p.CanonicalName, "llm"); err == nil {
			stats.NewTaxonomyHints++
		}
	}

	// ── Inspeção / inactive / inspected ─────────────────────────────────────
	hasPrice := p.LowestPrice.Valid && p.LowestPrice.Float64 > 0
	hasImage := p.ImageURL.Valid && strings.TrimSpace(p.ImageURL.String) != ""

	notes := strings.TrimSpace(result.Summary)
	if len(result.Issues) > 0 {
		if notes != "" {
			notes += " · "
		}
		notes += "Issues: " + strings.Join(result.Issues, "; ")
	}
	confTrail := fmt.Sprintf("conf=%.2f", result.Confidence)
	if notes != "" {
		notes = confTrail + " · " + notes
	} else {
		notes = confTrail
	}

	eligibleInspect := result.ReadyForDispatch &&
		result.Confidence >= unifiedInspectConfidenceMin &&
		hasPrice && hasImage

	if eligibleInspect {
		stats.MarkedInspected = true
		p.Inspected = true
		p.InspectedAt = models.NullTime{NullTime: sql.NullTime{Time: time.Now(), Valid: true}}
		p.InspectionNotes = models.NullString{NullString: sql.NullString{String: notes, Valid: true}}
	} else {
		p.InspectionNotes = models.NullString{NullString: sql.NullString{String: notes, Valid: notes != ""}}
	}

	if !result.ReadyForDispatch || !hasPrice {
		p.Inactive = true
		if !hasPrice && result.ReadyForDispatch {
			n := notes + " · desativado: sem preço"
			p.InspectionNotes = models.NullString{NullString: sql.NullString{String: n, Valid: true}}
		}
	}

	if err := h.store.UpdateCatalogProduct(p); err != nil {
		llm.RecordHandlerError(operation, "db", "UpdateCatalogProduct: "+err.Error(), notes)
		return nil, err
	}

	slog.Info("unified curation+inspect",
		"id", productID,
		"name", oldName,
		"ready", result.ReadyForDispatch,
		"confidence", result.Confidence,
		"marked_inspected", stats.MarkedInspected,
		"categorized", stats.Categorized)

	return stats, nil
}
