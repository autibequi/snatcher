package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/jobs"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
)


type CurationHandler struct {
	store  store.Store
	db     *sqlx.DB
	llmFn  func() llm.Client // factory lazy — lê config do banco
}

func NewCurationHandler(st store.Store, db *sqlx.DB, llmFn func() llm.Client) *CurationHandler {
	return &CurationHandler{store: st, db: db, llmFn: llmFn}
}

func (h *CurationHandler) SetLLMFn(fn func() llm.Client) {
	h.llmFn = fn
}

type curationRow struct {
	ID            int64   `db:"id" json:"id"`
	CanonicalName string  `db:"canonical_name" json:"canonical_name"`
	Brand         *string `db:"brand" json:"brand,omitempty"`
	ImageURL      *string `db:"image_url" json:"image_url,omitempty"`
	LowestPrice   *float64 `db:"lowest_price" json:"lowest_price,omitempty"`
	Tags          string  `db:"tags" json:"tags"`
	CurationStatus string `db:"curation_status" json:"curation_status"`
	CreatedAt     string  `db:"created_at" json:"created_at"`
}

// List GET /api/curation/needs-taxonomy
// Retorna produtos que precisam de curadoria: pending OU incompletos (sem marca ou sem categoria).
func (h *CurationHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	var rows []curationRow
	err := h.db.SelectContext(r.Context(), &rows, `
		SELECT id, canonical_name, brand, image_url, lowest_price, tags, curation_status,
		       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS created_at
		FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND (
		    curation_status = 'pending'
		    OR (brand IS NULL OR brand = '')
		    OR tags IS NULL
		    OR tags = '[]'::jsonb
		    OR jsonb_array_length(tags) = 0
		  )
		ORDER BY
		    CASE WHEN curation_status = 'pending' THEN 0 ELSE 1 END,
		    created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []curationRow{}
	}
	writeJSON(w, http.StatusOK, rows)
}

// Stats GET /api/curation/stats
func (h *CurationHandler) Stats(w http.ResponseWriter, r *http.Request) {
	type stat struct {
		Status string `db:"curation_status" json:"status"`
		Count  int64  `db:"count" json:"count"`
	}
	var rows []stat
	_ = h.db.SelectContext(r.Context(), &rows, `
		SELECT curation_status, COUNT(*) AS count
		FROM catalogproduct
		GROUP BY curation_status
		ORDER BY count DESC`)
	if rows == nil {
		rows = []stat{}
	}
	// Adiciona contagem de incompletos (sem marca ou sem categoria, não rejeitados)
	var incomplete int64
	_ = h.db.GetContext(r.Context(), &incomplete, `
		SELECT COUNT(*) FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND curation_status != 'pending'
		  AND ((brand IS NULL OR brand = '') OR tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0)`)
	rows = append(rows, stat{Status: "incomplete", Count: incomplete})

	// Inspecionados / pendentes de inspeção
	var inspected, notInspected int64
	_ = h.db.GetContext(r.Context(), &inspected,
		`SELECT COUNT(*) FROM catalogproduct WHERE inspected = true AND inactive = false`)
	_ = h.db.GetContext(r.Context(), &notInspected,
		`SELECT COUNT(*) FROM catalogproduct WHERE inspected = false AND inactive = false`)
	rows = append(rows, stat{Status: "inspected", Count: inspected})
	rows = append(rows, stat{Status: "not_inspected", Count: notInspected})

	writeJSON(w, http.StatusOK, rows)
}

type assignTaxonomyForm struct {
	Categories []string `json:"categories"`
	Brand      string   `json:"brand"`
}

// AssignTaxonomy PATCH /api/curation/{id}/taxonomy
// Aplica categoria(s)+marca ao produto e marca como curated.
func (h *CurationHandler) AssignTaxonomy(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var f assignTaxonomyForm
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	// Mescla categorias atuais + novas (sem duplicar)
	current := p.GetTags()
	seen := map[string]bool{}
	for _, t := range current {
		seen[strings.ToLower(t)] = true
	}
	for _, c := range f.Categories {
		c = strings.TrimSpace(c)
		if c == "" || seen[strings.ToLower(c)] {
			continue
		}
		current = append(current, c)
		seen[strings.ToLower(c)] = true
	}
	p.SetTags(current)
	if strings.TrimSpace(f.Brand) != "" {
		p.Brand.String = strings.TrimSpace(f.Brand)
		p.Brand.Valid = true
	}
	p.CurationStatus = "curated"
	if err := h.store.UpdateCatalogProduct(p); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Reject POST /api/curation/{id}/reject — descarta produto da fila
func (h *CurationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	p.CurationStatus = "rejected"
	if err := h.store.UpdateCatalogProduct(p); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// AutoHeuristic POST /api/curation/auto-heuristic
// Roda heurísticas em produtos pending e incompletos (sem marca ou sem categoria).
func (h *CurationHandler) AutoHeuristic(w http.ResponseWriter, r *http.Request) {
	var products []curationRow
	err := h.db.SelectContext(r.Context(), &products, `
		SELECT id, canonical_name, brand, tags, curation_status
		FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND (
		    curation_status = 'pending'
		    OR (brand IS NULL OR brand = '')
		    OR tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0
		  )
		LIMIT 200`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	processed, categorized, branded := 0, 0, 0
	for _, row := range products {
		p, err := h.store.GetCatalogProduct(row.ID)
		if err != nil {
			continue
		}
		changed := false
		// Extrai quantity se ainda vazio
		if p.Quantity == "" {
			if q := pipeline.ExtractQuantity(p.CanonicalName); q != "" {
				p.Quantity = q
				changed = true
			}
		}
		// Detecta taxonomia — preenche categoria e marca
		matchedIDs, _ := h.store.DetectAndUpsertTaxonomy(p.CanonicalName)
		if len(matchedIDs) > 0 {
			taxEntries, _ := h.store.GetTaxonomyByIDs(matchedIDs)
			for _, t := range taxEntries {
				switch t.Type {
				case "brand":
					if !p.Brand.Valid || p.Brand.String == "" {
						p.Brand.String = t.Name
						p.Brand.Valid = true
						branded++
						changed = true
					}
				case "category":
					tags := p.GetTags()
					found := false
					for _, tag := range tags {
						if strings.EqualFold(tag, t.Name) {
							found = true
							break
						}
					}
					if !found {
						p.SetTags(append(tags, t.Name))
						changed = true
					}
				}
			}
			if p.CurationStatus == "pending" {
				p.CurationStatus = "auto"
				categorized++
				changed = true
			}
		}
		if changed {
			_ = h.store.UpdateCatalogProduct(p)
		}
		processed++
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"processed":   processed,
		"categorized": categorized,
		"branded":     branded,
		"remaining":   len(products) - categorized,
	})
}

// AutoLLM POST /api/curation/auto-llm
// Dispara o job em background e retorna 202 imediatamente — evita 504 de proxy.
// Acompanhe o progresso via /api/curation/stats e /api/admin/llm/logs.
func (h *CurationHandler) AutoLLM(w http.ResponseWriter, r *http.Request) {
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado — configure em Configurações → LLM/IA")
		return
	}

	if jobs.Default().HasRunning("AutoLLM") {
		writeJSON(w, http.StatusOK, map[string]any{"started": false, "message": "AutoLLM já está rodando — veja em Jobs"})
		return
	}

	job, ctx := jobs.Default().Start(context.Background(), "AutoLLM")
	go func() {
		jobCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
		defer cancel()
		h.runAutoLLM(jobCtx, cli, job.ID)
	}()

	writeJSON(w, http.StatusAccepted, map[string]any{
		"started": true,
		"job_id":  job.ID,
		"message": "AutoLLM rodando em background — acompanhe em /jobs",
	})
}

// ensureTaxonomyEntry garante que existe uma entrada (pelo menos pending) na taxonomy
// para um par (type, name). Se já existe (qualquer status), no-op. Se não, cria como pending.
// Retorna true se criou nova entrada.
func (h *CurationHandler) ensureTaxonomyEntry(taxType, name, sampleText string) bool {
	if taxType == "" || name == "" {
		return false
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return false
	}
	// Busca existing — listamos por type e checamos por nome case-insensitive
	existing, err := h.store.ListTaxonomy(taxType)
	if err == nil {
		for _, t := range existing {
			if strings.EqualFold(t.Name, name) {
				return false // já existe
			}
		}
	}
	// Cria como pending — usa o nome lowercase como keyword inicial
	keywords := []string{strings.ToLower(name)}
	_, err = h.store.SuggestTaxonomyCandidate(taxType, name, keywords, sampleText, "llm")
	return err == nil
}

// runAutoLLM executa o trabalho de curadoria via LLM. Roda em goroutine.
func (h *CurationHandler) runAutoLLM(ctx context.Context, cli llm.Client, jobID string) {
	defer func() {
		if r := recover(); r != nil {
			jobs.Default().Fail(jobID, fmt.Sprintf("panic: %v", r))
		}
	}()

	var products []curationRow
	err := h.db.SelectContext(ctx, &products, `
		SELECT id, canonical_name, brand, tags, curation_status
		FROM catalogproduct
		WHERE curation_status != 'rejected'
		  AND (
		    curation_status = 'pending'
		    OR (brand IS NULL OR brand = '')
		    OR tags IS NULL OR tags = '[]'::jsonb OR jsonb_array_length(tags) = 0
		  )
		ORDER BY created_at DESC LIMIT 20`)
	if err != nil {
		slog.Error("AutoLLM: query failed", "err", err)
		return
	}
	if len(products) == 0 {
		slog.Info("AutoLLM: nada pendente")
		return
	}

	processed, categorized, newTaxonomies := 0, 0, 0
	var firstErr string
	var llmCallErrors, parseErrors int
	for _, row := range products {
		// Busca contexto adicional do produto (preço, fonte, imagem)
		fullProduct, _ := h.store.GetCatalogProduct(row.ID)
		extraCtx := ""
		if fullProduct.LowestPrice.Valid && fullProduct.LowestPrice.Float64 > 0 {
			extraCtx += fmt.Sprintf("\nPreço aproximado: R$ %.2f", fullProduct.LowestPrice.Float64)
		}
		if fullProduct.LowestPriceSource.Valid && fullProduct.LowestPriceSource.String != "" {
			extraCtx += "\nFonte: " + fullProduct.LowestPriceSource.String
		}
		if fullProduct.LowestPriceURL.Valid && fullProduct.LowestPriceURL.String != "" {
			extraCtx += "\nURL: " + fullProduct.LowestPriceURL.String
		}
		if fullProduct.ImageURL.Valid && fullProduct.ImageURL.String != "" {
			extraCtx += "\nImagem: " + fullProduct.ImageURL.String
		}

		prompt := fmt.Sprintf(`Você é um especialista em e-commerce brasileiro. Categorize o produto abaixo COM PRECISÃO. NÃO assuma que é suplemento/fitness — analise nome+contexto.

DADOS:
Nome: %s%s

Responda SOMENTE em JSON (sem markdown, sem <think>...</think>, sem prefácio):
{
  "category": "categoria principal em pt-BR (ex: Suplementos, Eletrônicos, Jogos, Roupas, Beleza, Eletrodomésticos, Brinquedos) ou null",
  "brand": "marca real do produto (ex: Apple, Nintendo, Growth) ou null",
  "quantity": "tamanho/quantidade (ex: 900g, 2kg, 30 caps, 256GB) ou null",
  "flavor": "sabor se aplicável (apenas comestíveis) ou null",
  "new_taxonomies": [
    {"type": "brand|category|flavor|weight", "name": "Nome", "keywords": ["palavra1", "palavra2"]}
  ]
}

REGRAS:
- Use a URL e a imagem como pistas — domínio amazon.com/loja-X indica plataforma, não marca
- "talking flower" + nintendo = Brinquedo Nintendo, não CBD
- "jogo X switch" = Jogos para Nintendo Switch, marca = publisher (ex: Nintendo)
- Só sugira new_taxonomies se forem categorias/marcas RECORRENTES, não específicas de 1 produto

JSON:`, row.CanonicalName, extraCtx)

		resp, err := cli.Complete(ctx, prompt, llm.Options{
			MaxTokens:   4000, // tokens altos pra modelos thinking terminarem reasoning + emitirem JSON
			Temperature: 0.1,
			Operation:   "curation",
			JSONMode:    true,
		})
		if err != nil {
			llmCallErrors++
			if firstErr == "" {
				firstErr = err.Error()
			}
			continue
		}

		rawResp := resp
		resp = strings.TrimSpace(resp)
		// Remove <think>...</think> de modelos de reasoning (deepseek-r1, qwen3)
		if i := strings.Index(resp, "</think>"); i >= 0 {
			resp = strings.TrimSpace(resp[i+len("</think>"):])
		}
		resp = strings.TrimPrefix(resp, "```json")
		resp = strings.TrimPrefix(resp, "```")
		resp = strings.TrimSuffix(resp, "```")
		resp = strings.TrimSpace(resp)
		// Tenta extrair primeiro bloco JSON válido se houver texto extra
		if start := strings.Index(resp, "{"); start > 0 {
			resp = resp[start:]
		}

		var result struct {
			Category     *string `json:"category"`
			Brand        *string `json:"brand"`
			Quantity     *string `json:"quantity"`
			Flavor       *string `json:"flavor"`
			NewTaxonomies []struct {
				Type     string   `json:"type"`
				Name     string   `json:"name"`
				Keywords []string `json:"keywords"`
			} `json:"new_taxonomies"`
		}
		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			parseErrors++
			parseErrMsg := "handler parse: " + err.Error()
			if firstErr == "" {
				firstErr = parseErrMsg + " — resp: " + resp
			}
			// Loga no llm_metrics pra aparecer no /logs → tab LLM
			llm.RecordHandlerError("curation", "", parseErrMsg, rawResp)
			continue
		}

		p, err := h.store.GetCatalogProduct(row.ID)
		if err != nil {
			continue
		}

		changed := false
		if result.Category != nil && *result.Category != "" {
			tags := p.GetTags()
			tags = append(tags, *result.Category)
			p.SetTags(tags)
			if p.CurationStatus == "pending" {
				p.CurationStatus = "curated"
				categorized++
			}
			changed = true
			// Auto-promove categoria pra taxonomy (se ainda não existe)
			if h.ensureTaxonomyEntry("category", *result.Category, row.CanonicalName) {
				newTaxonomies++
			}
		}
		if result.Brand != nil && *result.Brand != "" && (!p.Brand.Valid || p.Brand.String == "") {
			p.Brand.String = *result.Brand
			p.Brand.Valid = true
			changed = true
			// Auto-promove marca pra taxonomy
			if h.ensureTaxonomyEntry("brand", *result.Brand, row.CanonicalName) {
				newTaxonomies++
			}
		}
		if result.Flavor != nil && *result.Flavor != "" {
			// Auto-promove sabor pra taxonomy
			if h.ensureTaxonomyEntry("flavor", *result.Flavor, row.CanonicalName) {
				newTaxonomies++
			}
		}
		if result.Quantity != nil && *result.Quantity != "" && p.Quantity == "" {
			p.Quantity = *result.Quantity
			changed = true
		}
		if result.Flavor != nil && *result.Flavor != "" {
			tags := p.GetTags()
			tags = append(tags, *result.Flavor)
			p.SetTags(tags)
			changed = true
		}
		if changed {
			_ = h.store.UpdateCatalogProduct(p)
		}
		processed++
		jobs.Default().Update(jobID, processed, len(products), fmt.Sprintf("processado %s", row.CanonicalName))

		// Salvar propostas de novas taxonomias como pending para revisão humana
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
			_, _ = h.store.SuggestTaxonomyCandidate(nt.Type, nt.Name, nt.Keywords, row.CanonicalName, "llm")
			newTaxonomies++
		}
	}

	slog.Info("AutoLLM: concluído",
		"processed", processed,
		"categorized", categorized,
		"new_taxonomies", newTaxonomies,
		"errors", llmCallErrors+parseErrors,
		"first_error", firstErr)
	jobs.Default().Done(jobID, fmt.Sprintf("%d processados, %d categorizados, %d taxonomias novas, %d erros", processed, categorized, newTaxonomies, llmCallErrors+parseErrors))
}

// InspectAll POST /api/curation/inspect-all
// Dispara o job em background e retorna 202 imediatamente.
// Acompanhe via /api/curation/stats e /api/admin/llm/logs.
func (h *CurationHandler) InspectAll(w http.ResponseWriter, r *http.Request) {
	jobID, started, msg := h.TriggerInspectAll()
	if !started {
		if msg == "" {
			msg = "Inspeção não iniciada"
		}
		if jobID == "" {
			writeErr(w, http.StatusServiceUnavailable, msg)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"started": false, "message": msg})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"started": true,
		"job_id":  jobID,
		"message": "Inspeção rodando em background — acompanhe em /jobs",
	})
}

// TriggerInspectAll inicia o job de inspeção em background.
// Retorna (jobID, started, message). Reusável de fora do contexto HTTP (ex: Jonfrey).
func (h *CurationHandler) TriggerInspectAll() (string, bool, string) {
	cli := h.llmFn()
	if cli == nil {
		return "", false, "LLM não configurado — configure em Configurações → LLM/IA"
	}
	if jobs.Default().HasRunning("InspectAll") {
		return "", false, "Inspeção já está rodando — veja em Jobs"
	}
	job, ctx := jobs.Default().Start(context.Background(), "InspectAll")
	go func() {
		jobCtx, cancel := context.WithTimeout(ctx, 60*time.Minute)
		defer cancel()
		h.runInspectAll(jobCtx, cli, job.ID)
	}()
	return job.ID, true, ""
}

// runInspectAll executa a inspeção via LLM. Roda em goroutine.
func (h *CurationHandler) runInspectAll(ctx context.Context, cli llm.Client, jobID string) {
	defer func() {
		if r := recover(); r != nil {
			jobs.Default().Fail(jobID, fmt.Sprintf("panic: %v", r))
		}
	}()

	type prodRow struct {
		ID                int64    `db:"id"`
		CanonicalName     string   `db:"canonical_name"`
		Brand             *string  `db:"brand"`
		Tags              string   `db:"tags"`
		Quantity          string   `db:"quantity"`
		LowestPrice       *float64 `db:"lowest_price"`
		LowestPriceSource *string  `db:"lowest_price_source"`
		ImageURL          *string  `db:"image_url"`
	}
	var products []prodRow
	err := h.db.SelectContext(ctx, &products, `
		SELECT id, canonical_name, brand, tags, quantity,
		       lowest_price, lowest_price_source, image_url
		FROM catalogproduct
		WHERE inspected = false AND inactive = false
		ORDER BY created_at DESC
		LIMIT 30`)
	if err != nil {
		slog.Error("InspectAll: query failed", "err", err)
		return
	}
	if len(products) == 0 {
		slog.Info("InspectAll: nada a inspecionar")
		return
	}

	inspected, corrected := 0, 0
	var firstErr string
	var llmErrors int

	for _, row := range products {
		brand := ""
		if row.Brand != nil {
			brand = *row.Brand
		}
		price := 0.0
		if row.LowestPrice != nil {
			price = *row.LowestPrice
		}
		imgURL := ""
		if row.ImageURL != nil {
			imgURL = *row.ImageURL
		}
		src := ""
		if row.LowestPriceSource != nil {
			src = *row.LowestPriceSource
		}

		prompt := fmt.Sprintf(`Você é um auditor de e-commerce. Inspecione este produto e indique se está pronto para envio em campanhas (precisa ter nome limpo, marca, categoria, preço e imagem).

PRODUTO:
- Nome: %s
- Marca: %s
- Tags: %s
- Quantidade: %s
- Preço: R$ %.2f
- Imagem: %s
- Fonte: %s

Responda SOMENTE em JSON:
{
  "ready_for_dispatch": true|false,
  "issues": ["lista de problemas encontrados"],
  "corrections": {
    "canonical_name": "nome limpo e capitalizado, ou null se já está bom",
    "brand": "marca correta, ou null",
    "add_tags": ["tags faltando para categorizar"],
    "quantity": "quantidade extraída, ou null"
  },
  "summary": "uma frase explicando o estado"
}

Sem markdown, sem texto extra.`, row.CanonicalName, brand, row.Tags, row.Quantity, price, imgURL, src)

		resp, err := cli.Complete(ctx, prompt, llm.Options{
			MaxTokens:   5000, // tokens altos pra modelos thinking
			Temperature: 0.1,
			Operation:   "inspect",
			JSONMode:    true,
		})
		if err != nil {
			llmErrors++
			if firstErr == "" {
				firstErr = err.Error()
			}
			continue
		}

		rawResp := resp
		resp = strings.TrimSpace(resp)
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

		var result struct {
			ReadyForDispatch bool     `json:"ready_for_dispatch"`
			Issues           []string `json:"issues"`
			Summary          string   `json:"summary"`
			Corrections      struct {
				CanonicalName *string  `json:"canonical_name"`
				Brand         *string  `json:"brand"`
				AddTags       []string `json:"add_tags"`
				Quantity      *string  `json:"quantity"`
			} `json:"corrections"`
		}
		if err := json.Unmarshal([]byte(resp), &result); err != nil {
			llmErrors++
			if firstErr == "" {
				firstErr = "parse: " + err.Error()
			}
			llm.RecordHandlerError("inspect", "", "handler parse: "+err.Error(), rawResp)
			continue
		}

		// Aplicar correções
		p, err := h.store.GetCatalogProduct(row.ID)
		if err != nil {
			slog.Error("Inspect: GetCatalogProduct failed", "id", row.ID, "err", err)
			continue
		}
		hadCorrection := false
		oldName := p.CanonicalName
		var changes []string
		if result.Corrections.CanonicalName != nil && *result.Corrections.CanonicalName != "" && *result.Corrections.CanonicalName != p.CanonicalName {
			p.CanonicalName = *result.Corrections.CanonicalName
			changes = append(changes, fmt.Sprintf("name: %q→%q", oldName, p.CanonicalName))
			hadCorrection = true
		}
		if result.Corrections.Brand != nil && *result.Corrections.Brand != "" && (!p.Brand.Valid || p.Brand.String == "") {
			p.Brand.String = *result.Corrections.Brand
			p.Brand.Valid = true
			changes = append(changes, "brand="+*result.Corrections.Brand)
			hadCorrection = true
			// Auto-promove marca pra taxonomy (alimenta o crawler)
			h.ensureTaxonomyEntry("brand", *result.Corrections.Brand, oldName)
		}
		if result.Corrections.Quantity != nil && *result.Corrections.Quantity != "" && p.Quantity == "" {
			p.Quantity = *result.Corrections.Quantity
			changes = append(changes, "quantity="+*result.Corrections.Quantity)
			hadCorrection = true
		}
		if len(result.Corrections.AddTags) > 0 {
			tags := p.GetTags()
			seen := map[string]bool{}
			for _, t := range tags {
				seen[strings.ToLower(t)] = true
			}
			added := []string{}
			for _, t := range result.Corrections.AddTags {
				if t != "" && !seen[strings.ToLower(t)] {
					tags = append(tags, t)
					seen[strings.ToLower(t)] = true
					added = append(added, t)
					hadCorrection = true
				}
			}
			if len(added) > 0 {
				p.SetTags(tags)
				changes = append(changes, "tags+="+strings.Join(added, ","))
				// Auto-promove cada nova tag pra taxonomy como category
				for _, t := range added {
					h.ensureTaxonomyEntry("category", t, oldName)
				}
			}
		}

		notes := result.Summary
		if len(result.Issues) > 0 {
			notes += " · Issues: " + strings.Join(result.Issues, "; ")
		}
		p.Inspected = true
		p.InspectedAt = models.NullTime{NullTime: sql.NullTime{Time: time.Now(), Valid: true}}
		p.InspectionNotes = models.NullString{NullString: sql.NullString{String: notes, Valid: notes != ""}}
		if updErr := h.store.UpdateCatalogProduct(p); updErr != nil {
			slog.Error("Inspect: UpdateCatalogProduct failed", "id", row.ID, "err", updErr)
			llm.RecordHandlerError("inspect", "db", "UpdateCatalogProduct: "+updErr.Error(), notes)
			continue
		}

		slog.Info("Inspect: produto auditado",
			"id", row.ID,
			"name", oldName,
			"ready_for_dispatch", result.ReadyForDispatch,
			"changes", changes,
			"issues_count", len(result.Issues))

		inspected++
		if hadCorrection {
			corrected++
		}
		jobs.Default().Update(jobID, inspected, len(products), fmt.Sprintf("auditado %s", oldName))
	}

	slog.Info("InspectAll: concluído",
		"inspected", inspected,
		"corrected", corrected,
		"errors", llmErrors,
		"first_error", firstErr,
		"remaining", len(products)-inspected)
	jobs.Default().Done(jobID, fmt.Sprintf("%d auditados, %d corrigidos, %d erros, %d restantes", inspected, corrected, llmErrors, len(products)-inspected))
}
