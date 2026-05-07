package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"snatcher/backendv2/internal/jobs"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
)

// searchTermRequest aceita queries como array (como o frontend envia).
type searchTermRequest struct {
	Query         string   `json:"query"              validate:"required,min=2"`
	Queries       []string `json:"queries"`
	MinVal        float64  `json:"min_val"            validate:"gte=0"`
	MaxVal        float64  `json:"max_val"            validate:"gte=0"`
	Sources       string   `json:"sources"`
	Category      string   `json:"category"           validate:"omitempty,oneof=ecommerce cdkey"`
	Active        *bool    `json:"active"`
	CrawlInterval int      `json:"crawl_interval"`
}

func (req searchTermRequest) toModel() models.SearchTerm {
	queriesJSON, _ := json.Marshal(req.Queries)
	t := models.SearchTerm{
		Query:         req.Query,
		Queries:       string(queriesJSON),
		MinVal:        req.MinVal,
		MaxVal:        req.MaxVal,
		Sources:       req.Sources,
		Category:      req.Category,
		CrawlInterval: req.CrawlInterval,
	}
	if t.Queries == "" || t.Queries == "null" {
		t.Queries = "[]"
	}
	if t.Sources == "" {
		t.Sources = "all"
	}
	if t.Category == "" {
		t.Category = "ecommerce"
	}
	if t.CrawlInterval == 0 {
		t.CrawlInterval = 30
	}
	if req.Active != nil {
		t.Active = *req.Active
	} else {
		t.Active = true
	}
	return t
}

type SearchTermsHandler struct {
	store    store.Store
	scrapers map[string]pipeline.Scraper
	llmFn    func() llm.Client
}

func NewSearchTerms(st store.Store, scrapers map[string]pipeline.Scraper) *SearchTermsHandler {
	return &SearchTermsHandler{store: st, scrapers: scrapers}
}

// SetLLMFn injeta o factory de LLM client.
func (h *SearchTermsHandler) SetLLMFn(fn func() llm.Client) {
	h.llmFn = fn
}

// List retorna todos os search terms.
//
//	@Summary      Listar search terms
//	@Description  Retorna todos os termos de busca cadastrados.
//	@Tags         search-terms
//	@Produce      json
//	@Success      200  {array}   models.SearchTerm
//	@Failure      500  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/search-terms [get]
func (h *SearchTermsHandler) List(w http.ResponseWriter, r *http.Request) {
	terms, err := h.store.ListSearchTerms()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if terms == nil {
		terms = []models.SearchTerm{}
	}
	writeJSON(w, http.StatusOK, terms)
}

func (h *SearchTermsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	t, err := h.store.GetSearchTerm(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// Create cria um novo search term.
//
//	@Summary      Criar search term
//	@Description  Cria um novo termo de busca para scraping.
//	@Tags         search-terms
//	@Accept       json
//	@Produce      json
//	@Param        body  body      searchTermRequest  true  "Dados do search term"
//	@Success      201   {object}  models.SearchTerm
//	@Failure      400   {object}  object{error=string}
//	@Failure      500   {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/search-terms [post]
func (h *SearchTermsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req searchTermRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	t := req.toModel()
	id, err := h.store.CreateSearchTerm(t)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	t.ID = id
	writeJSON(w, http.StatusCreated, t)
}

func (h *SearchTermsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req searchTermRequest
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	t := req.toModel()
	t.ID = id
	if err := h.store.UpdateSearchTerm(t); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *SearchTermsHandler) ListResults(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, err := h.store.GetSearchTerm(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 30
	}
	results, err := h.store.ListCrawlResultsByTerm(id, limit, offset)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if results == nil {
		results = []models.CrawlResult{}
	}
	total, _ := h.store.CountCrawlResultsByTerm(id)
	writeJSON(w, http.StatusOK, map[string]any{
		"items": results, "total": total, "limit": limit, "offset": offset,
	})
}

func (h *SearchTermsHandler) CrawlNow(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	term, err := h.store.GetSearchTerm(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	jobName := fmt.Sprintf("Crawl[%s]", term.Query)
	job, ctx := jobs.Default().Start(context.Background(), jobName)
	jobID := job.ID
	go func() {
		defer func() {
			if r := recover(); r != nil {
				jobs.Default().Fail(jobID, fmt.Sprintf("panic: %v", r))
			}
		}()
		jobs.Default().Update(jobID, 0, 2, "crawling sources…")
		if err := pipeline.CrawlSearchTerm(ctx, h.store, term, h.scrapers); err != nil {
			jobs.Default().Fail(jobID, err.Error())
			return
		}
		jobs.Default().Update(jobID, 1, 2, "processing crawled results…")
		if err := pipeline.ProcessCrawlResults(ctx, h.store); err != nil {
			jobs.Default().Fail(jobID, err.Error())
			return
		}
		jobs.Default().Done(jobID, "crawl + process concluídos")
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{
		"status":         "triggered",
		"search_term_id": id,
		"job_id":         jobID,
	})
}

func (h *SearchTermsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteSearchTerm(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Suggest POST /api/search-terms/suggest
// Usa LLM pra recomendar configuração de crawler.
// Body (todos opcionais):
//
//	{ "intent": "quero rastrear suplementos baratos", "mode": "next|expand" }
//
// - intent: descrição livre do que crawlear. Se vazio, LLM analisa os existentes e sugere algo
// - mode: "next" = próximo da área atual; "expand" = mercado novo distante
func (h *SearchTermsHandler) Suggest(w http.ResponseWriter, r *http.Request) {
	if h.llmFn == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado — configure em Configurações → LLM/IA")
		return
	}

	var req struct {
		Intent string `json:"intent"` // "quero rastrear Nintendo Switch baratos"
		Mode   string `json:"mode"`   // "next" | "expand" | "" (auto)
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	// Busca termos existentes para contexto
	existing, _ := h.store.ListSearchTerms()
	existingLines := []string{}
	for _, t := range existing {
		queries := t.GetQueries()
		line := fmt.Sprintf("- %q (fontes: %s, resultados: %d/ciclo)", queries[0], t.GetSources(), t.ResultCount)
		existingLines = append(existingLines, line)
	}
	existingCtx := "Nenhum crawler configurado ainda."
	if len(existingLines) > 0 {
		max := 30
		if len(existingLines) < max {
			max = len(existingLines)
		}
		existingCtx = strings.Join(existingLines[:max], "\n")
	}

	modeInstruction := ""
	switch req.Mode {
	case "expand":
		modeInstruction = "\nO usuário quer explorar um NICHO DIFERENTE — sugira algo distante dos crawlers atuais, novo mercado ou categoria."
	case "next":
		modeInstruction = "\nO usuário quer complementar os crawlers atuais — sugira algo próximo/relacionado ao que já rastreia."
	default:
		if req.Intent == "" {
			modeInstruction = "\nAnalise os crawlers existentes e sugira o PRÓXIMO MELHOR crawler pra complementar ou um novo mercado promissor."
		}
	}

	intentCtx := ""
	if req.Intent != "" {
		intentCtx = fmt.Sprintf("\n\nINTENÇÃO DO USUÁRIO: %s", req.Intent)
	}

	prompt := fmt.Sprintf(`Você é um especialista em e-commerce brasileiro e configuração de crawlers de preço.

CRAWLERS JÁ CONFIGURADOS:
%s
%s%s

Recomende UMA configuração de crawler otimizada para o contexto acima. Responda SOMENTE em JSON:
{
  "query": "termo de busca principal (ex: whey protein 900g)",
  "queries": ["variação 1", "variação 2", "variação 3"],
  "sources": ["amazon", "mercadolivre"],
  "min_val": 0,
  "max_val": 500,
  "crawl_interval": 60,
  "rationale": "Explicação em 1-2 frases do por que essa configuração faz sentido",
  "expected_products": "estimativa de quantos produtos por ciclo (ex: 10-30)",
  "category": "ecommerce"
}

REGRAS:
- query deve ser específica o suficiente pra encontrar bons produtos mas não muito restrita
- queries deve ter 3-5 variações (marcas, sinônimos, formatos)
- sources: use ["amazon","mercadolivre"] como padrão; Magalu/Shopee pra categorias fashion/eletro
- min_val/max_val: faixa de preço realista pra categoria (0 = sem limite)
- crawl_interval: 30 pra mercados voláteis (tech, jogos), 60-120 pra mercados estáveis (moda, suplementos)
- rationale: seja específico sobre o gap que está preenchendo nos crawlers atuais

JSON:`, existingCtx, modeInstruction, intentCtx)

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	resp, err := cli.Complete(ctx, prompt, llm.Options{
		MaxTokens:   1000,
		Temperature: 0.3,
		Operation:   "suggest_crawler",
		JSONMode:    true,
		WebSearch:   true, // enriquece com tendências/produtos atuais via web
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "LLM: "+err.Error())
		return
	}

	// Limpeza
	resp = strings.TrimSpace(resp)
	if i := strings.Index(resp, "</think>"); i >= 0 {
		resp = strings.TrimSpace(resp[i+len("</think>"):])
	}
	resp = strings.TrimPrefix(resp, "```json")
	resp = strings.TrimPrefix(resp, "```")
	resp = strings.TrimSuffix(resp, "```")
	resp = strings.TrimSpace(resp)
	if s := strings.Index(resp, "{"); s > 0 {
		resp = resp[s:]
	}

	var suggestion struct {
		Query           string   `json:"query"`
		Queries         []string `json:"queries"`
		Sources         []string `json:"sources"`
		MinVal          float64  `json:"min_val"`
		MaxVal          float64  `json:"max_val"`
		CrawlInterval   int      `json:"crawl_interval"`
		Rationale       string   `json:"rationale"`
		ExpectedProducts string  `json:"expected_products"`
		Category        string   `json:"category"`
	}
	if err := json.Unmarshal([]byte(resp), &suggestion); err != nil {
		// Tenta extractLastJSON como fallback
		if extracted := extractLastJSONForSuggest(resp); extracted != "" {
			if err2 := json.Unmarshal([]byte(extracted), &suggestion); err2 != nil {
				writeErr(w, http.StatusBadGateway, "parse: "+err.Error())
				return
			}
		} else {
			writeErr(w, http.StatusBadGateway, "parse: "+err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"suggestion": suggestion,
		"intent":     req.Intent,
		"mode":       req.Mode,
		"existing_count": len(existing),
	})
}

// extractLastJSONForSuggest é igual ao extractLastJSON do openai_compat mas duplicado aqui
// pra evitar dependência circular entre packages (handlers → llm → handlers).
func extractLastJSONForSuggest(s string) string {
	s = strings.ReplaceAll(s, "```json", "")
	s = strings.ReplaceAll(s, "```", "")
	for start := strings.LastIndex(s, "{"); start >= 0; start = strings.LastIndex(s[:start], "{") {
		depth, inStr, escaped := 0, false, false
		for i := start; i < len(s); i++ {
			c := s[i]
			if escaped { escaped = false; continue }
			if c == '\\' && inStr { escaped = true; continue }
			if c == '"' { inStr = !inStr; continue }
			if inStr { continue }
			if c == '{' { depth++ } else if c == '}' {
				depth--
				if depth == 0 {
					candidate := s[start : i+1]
					if strings.Contains(candidate, ":") { return candidate }
					break
				}
			}
		}
	}
	return ""
}
