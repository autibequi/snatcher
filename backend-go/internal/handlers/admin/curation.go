package admin

import (
	"context"
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

	// Desativa produtos sem preço — não podem ser disparados
	var deactivated int64
	if res, err := h.db.ExecContext(r.Context(), `
		UPDATE catalogproduct SET inactive = true
		WHERE inactive = false
		  AND (lowest_price IS NULL OR lowest_price <= 0)`); err == nil {
		deactivated, _ = res.RowsAffected()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"processed":   processed,
		"categorized": categorized,
		"branded":     branded,
		"remaining":   len(products) - categorized,
		"deactivated_no_price": deactivated,
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

	processed, categorized, newTaxonomies, autoInspected, corrections := 0, 0, 0, 0, 0
	var firstErr string
	var llmErrors int
	for _, row := range products {
		stats, err := h.ProcessProductUnified(ctx, cli, row.ID, "auto_llm_unified")
		if err != nil {
			llmErrors++
			if firstErr == "" {
				firstErr = err.Error()
			}
			continue
		}
		processed++
		if stats.Categorized {
			categorized++
		}
		newTaxonomies += stats.NewTaxonomyHints
		if stats.MarkedInspected {
			autoInspected++
		}
		if stats.HadCorrection {
			corrections++
		}
		jobs.Default().Update(jobID, processed, len(products), fmt.Sprintf("processado %s", row.CanonicalName))
	}

	slog.Info("AutoLLM: concluído",
		"processed", processed,
		"categorized", categorized,
		"new_taxonomies", newTaxonomies,
		"auto_inspected", autoInspected,
		"correções_nome_marca", corrections,
		"errors", llmErrors,
		"first_error", firstErr)
	jobs.Default().Done(jobID, fmt.Sprintf("%d processados, %d categorizados, %d taxonomias, %d inspecionados (auto), %d erros",
		processed, categorized, newTaxonomies, autoInspected, llmErrors))
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

	type inspectRow struct {
		ID            int64  `db:"id"`
		CanonicalName string `db:"canonical_name"`
	}
	var products []inspectRow
	err := h.db.SelectContext(ctx, &products, `
		SELECT id, canonical_name
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

	processed, markedInspected, corrected := 0, 0, 0
	var firstErr string
	var llmErrors int

	for _, row := range products {
		stats, err := h.ProcessProductUnified(ctx, cli, row.ID, "inspect_all_unified")
		if err != nil {
			llmErrors++
			if firstErr == "" {
				firstErr = err.Error()
			}
			continue
		}
		processed++
		if stats.MarkedInspected {
			markedInspected++
		}
		if stats.HadCorrection {
			corrected++
		}
		jobs.Default().Update(jobID, processed, len(products), fmt.Sprintf("unificado %s", row.CanonicalName))
	}

	slog.Info("InspectAll: concluído",
		"processed", processed,
		"marked_inspected_high_conf", markedInspected,
		"correções", corrected,
		"errors", llmErrors,
		"first_error", firstErr,
		"remaining", len(products)-processed)
	jobs.Default().Done(jobID, fmt.Sprintf("%d processados (1 LLM/produto), %d inspecionados (conf≥%.2f), %d corrigidos, %d erros",
		processed, markedInspected, unifiedInspectConfidenceMin, corrected, llmErrors))
}
