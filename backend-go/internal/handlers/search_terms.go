package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

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
	store   store.Store
	scrapers map[string]pipeline.Scraper
}

func NewSearchTerms(st store.Store, scrapers map[string]pipeline.Scraper) *SearchTermsHandler {
	return &SearchTermsHandler{store: st, scrapers: scrapers}
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
	// Dispara crawl + process em background
	go func() {
		ctx := context.Background()
		_ = pipeline.CrawlSearchTerm(ctx, h.store, term, h.scrapers)
		_ = pipeline.ProcessCrawlResults(ctx, h.store)
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "triggered", "search_term_id": id})
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
