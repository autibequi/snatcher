package admin

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
)

type CatalogHandler struct {
	store store.Store
	db    *sqlx.DB
	llmFn func() llm.Client
}

func NewCatalog(st store.Store) *CatalogHandler {
	return &CatalogHandler{store: st}
}

func (h *CatalogHandler) SetLLMFn(fn func() llm.Client) { h.llmFn = fn }

// NewCatalogDB cria o handler com acesso direto ao DB para queries agregadas.
func NewCatalogDB(st store.Store, db *sqlx.DB) *CatalogHandler {
	return &CatalogHandler{store: st, db: db}
}

// List retorna produtos do catálogo com paginação.
//
//	@Summary      Listar catálogo
//	@Description  Retorna lista paginada de produtos do catálogo.
//	@Tags         catalog
//	@Produce      json
//	@Param        limit   query     int  false  "Número máximo de itens (default 30)"
//	@Param        offset  query     int  false  "Offset para paginação"
//	@Success      200     {object}  object{items=[]models.CatalogProduct,total=int,limit=int,offset=int}
//	@Failure      500     {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/catalog [get]
// Search godoc
// GET /api/catalog/search?q=whey&limit=10
func (h *CatalogHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	products, err := h.store.SearchCatalogProducts(q, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if products == nil {
		products = []models.CatalogProduct{}
	}
	writeJSON(w, http.StatusOK, products)
}

func (h *CatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 30
	}

	filters := store.CatalogFilters{
		Search:          q.Get("search"),
		Source:          q.Get("source"),
		Status:          q.Get("status"),
		Tag:             q.Get("tag"),
		Brand:           q.Get("brand"),
		IncludeInactive: q.Get("include_inactive") == "true",
		Limit:           limit,
		Offset:          offset,
	}

	products, total, err := h.store.FilterCatalogProducts(filters)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if products == nil {
		products = []models.CatalogProduct{}
	}

	resp := map[string]any{
		"items":  products,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	}

	if q.Get("grouped_counts") == "1" {
		resp["counts"] = h.groupedCounts(r)
	}

	writeJSON(w, http.StatusOK, resp)
}

// groupedCounts retorna contagens agrupadas por estado do catálogo.
//
// Definições:
//   - novos:         produtos criados nos últimos 7 dias (proxy para "recém descobertos")
//   - curados:       produtos com brand preenchido (proxy para "revisados/curados")
//   - disparados_7d: produtos que apareceram em pelo menos 1 dispatch nos últimos 7 dias
//   - tudo:          total de produtos
//
// TODO: quando catalogproduct tiver coluna status (pending_curation|approved|rejected),
// substituir proxies pelas contagens diretas.
func (h *CatalogHandler) groupedCounts(r *http.Request) map[string]int64 {
	counts := map[string]int64{
		"novos":        0,
		"curados":      0,
		"disparados_7d": 0,
		"tudo":         0,
	}

	total, _ := h.store.CountCatalogProducts()
	counts["tudo"] = total

	if h.db == nil {
		return counts
	}

	ctx := r.Context()
	since7d := time.Now().Add(-7 * 24 * time.Hour)

	// novos: curation_status='pending' criados nos últimos 7 dias
	var novos int64
	_ = h.db.GetContext(ctx, &novos,
		`SELECT COUNT(*) FROM catalogproduct WHERE curation_status='pending' AND created_at >= $1`, since7d)
	counts["novos"] = novos

	// curados: curation_status='curated'
	var curados int64
	_ = h.db.GetContext(ctx, &curados,
		`SELECT COUNT(*) FROM catalogproduct WHERE curation_status='curated'`)
	counts["curados"] = curados

	// disparados_7d: produtos vinculados a dispatches nos últimos 7 dias
	var disparados int64
	_ = h.db.GetContext(ctx, &disparados,
		`SELECT COUNT(DISTINCT d.product_id) FROM dispatches d
		 WHERE d.created_at >= $1 AND d.product_id IS NOT NULL`, since7d)
	counts["disparados_7d"] = disparados

	return counts
}

// Get retorna um produto do catálogo pelo ID.
//
//	@Summary      Obter produto
//	@Description  Retorna um produto com suas variantes pelo ID.
//	@Tags         catalog
//	@Produce      json
//	@Param        id   path      int  true  "ID do produto"
//	@Success      200  {object}  object{product=models.CatalogProduct,variants=[]models.CatalogVariant}
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/catalog/{id} [get]
func (h *CatalogHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	variants, _ := h.store.ListVariantsByProduct(id)
	if variants == nil {
		variants = []models.CatalogVariant{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"product": p, "variants": variants})
}

func (h *CatalogHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err := decodeBody(r, &p); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	p.ID = id
	if err := h.store.UpdateCatalogProduct(p); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *CatalogHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteCatalogProduct(id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PatchCurationStatus atualiza o curation_status de um produto.
//
//	@Summary      Atualizar curação
//	@Description  Define curation_status de um produto (curated|rejected|pending).
//	@Tags         catalog
//	@Accept       json
//	@Produce      json
//	@Param        id    path      int     true  "ID do produto"
//	@Param        body  body      object  true  "{ curation_status: string }"
//	@Success      200   {object}  models.CatalogProduct
//	@Failure      400   {object}  object{error=string}
//	@Failure      404   {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/catalog/{id} [patch]
func (h *CatalogHandler) PatchCurationStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	var req struct {
		CurationStatus string `json:"curation_status"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	switch req.CurationStatus {
	case "curated", "rejected", "pending":
	default:
		writeErr(w, http.StatusBadRequest, "curation_status must be curated, rejected or pending")
		return
	}

	p.CurationStatus = req.CurationStatus
	if err := h.store.UpdateCatalogProduct(p); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *CatalogHandler) ListVariantHistory(w http.ResponseWriter, r *http.Request) {
	variantID, ok := pathInt(r, "variant_id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid variant id")
		return
	}
	hist, err := h.store.ListPriceHistoryV2(variantID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if hist == nil {
		hist = []models.PriceHistoryV2{}
	}
	writeJSON(w, http.StatusOK, hist)
}

func (h *CatalogHandler) ListKeywords(w http.ResponseWriter, r *http.Request) {
	kws, err := h.store.ListGroupingKeywords()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if kws == nil {
		kws = []models.GroupingKeyword{}
	}
	writeJSON(w, http.StatusOK, kws)
}

// VariantStats retorna estatísticas de preço (percentis, média, score) para uma variante.
//
//	@Summary      Estatísticas de preço da variante
//	@Description  Retorna percentis (p25, p50, p75), média, preço atual e score de um variante em uma janela de tempo.
//	@Tags         catalog
//	@Produce      json
//	@Param        id       path      int     true  "ID da variante"
//	@Param        window   query     string  false "Janela de tempo (7d, 30d, 60d, 90d; default 90d)"
//	@Success      200      {object}  models.VariantStats
//	@Failure      400      {object}  object{error=string}
//	@Failure      404      {object}  object{error=string}
//	@Failure      500      {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/catalog/variants/{id}/stats [get]
func (h *CatalogHandler) VariantStats(w http.ResponseWriter, r *http.Request) {
	variantID, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid variant id")
		return
	}

	// Parse window parameter
	window := r.URL.Query().Get("window")
	if window == "" {
		window = "90d"
	}

	// Validate window
	windowDays := 0
	switch window {
	case "7d":
		windowDays = 7
	case "30d":
		windowDays = 30
	case "60d":
		windowDays = 60
	case "90d":
		windowDays = 90
	default:
		writeErr(w, http.StatusBadRequest, "invalid window; supported: 7d, 30d, 60d, 90d")
		return
	}

	// Verify variant exists
	variant, err := h.store.GetCatalogVariant(variantID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "variant not found")
		return
	}
	_ = variant // silence unused warning

	stats, err := h.store.GetVariantStats(variantID, windowDays)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	if stats == nil {
		// No price history for this variant
		writeJSON(w, http.StatusOK, map[string]any{
			"error":  "no_price_history",
			"window": window,
		})
		return
	}

	// Set cache header: 10 minutes
	w.Header().Set("Cache-Control", "public, max-age=600")
	writeJSON(w, http.StatusOK, stats)
}

// Reprocess reprocessa toda a base do catálogo: detecta taxonomia, preenche brand,
// e limpa duplicações da marca no canonical_name. Idempotente — pode rodar múltiplas vezes.
// POST /api/catalog/reprocess
func (h *CatalogHandler) Reprocess(w http.ResponseWriter, r *http.Request) {
	products, _, err := h.store.FilterCatalogProducts(store.CatalogFilters{Limit: 5000, IncludeInactive: true})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	branded, cleaned, categorized := 0, 0, 0
	for i := range products {
		p := &products[i]
		matchedIDs, _ := h.store.DetectAndUpsertTaxonomy(p.CanonicalName)
		if len(matchedIDs) == 0 {
			continue
		}
		taxEntries, err := h.store.GetTaxonomyByIDs(matchedIDs)
		if err != nil {
			continue
		}
		changed := false
		// Dedup case-insensitive das tags atuais (limpa duplicatas tipo "suplementos"/"Suplementos")
		originalTags := p.GetTags()
		dedupedTags := make([]string, 0, len(originalTags))
		seenTags := map[string]bool{}
		for _, tag := range originalTags {
			key := strings.ToLower(strings.TrimSpace(tag))
			if key == "" || seenTags[key] {
				continue
			}
			seenTags[key] = true
			dedupedTags = append(dedupedTags, tag)
		}
		if len(dedupedTags) != len(originalTags) {
			p.SetTags(dedupedTags)
			changed = true
		}

		for _, t := range taxEntries {
			switch t.Type {
			case "brand":
				if !p.Brand.Valid || p.Brand.String == "" {
					p.Brand = models.NullString{NullString: sql.NullString{String: t.Name, Valid: true}}
					branded++
					changed = true
				}
				cleanedName := pipeline.CleanTitle(p.CanonicalName, t.Name)
				if cleanedName != p.CanonicalName && cleanedName != "" {
					p.CanonicalName = cleanedName
					cleaned++
					changed = true
				}
			case "category":
				key := strings.ToLower(t.Name)
				if !seenTags[key] {
					seenTags[key] = true
					p.SetTags(append(p.GetTags(), t.Name))
					categorized++
					changed = true
				}
			}
		}
		if changed {
			_ = h.store.UpdateCatalogProduct(*p)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"branded":     branded,
		"cleaned":     cleaned,
		"categorized": categorized,
		"total":       len(products),
	})
}

// SuggestTags POST /api/catalog/{id}/suggest-tags
// Sugere 5-10 tags relevantes via LLM usando vocabulário existente.
func (h *CatalogHandler) SuggestTags(w http.ResponseWriter, r *http.Request) {
	if h.llmFn == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}
	cli := h.llmFn()
	if cli == nil {
		writeErr(w, http.StatusServiceUnavailable, "LLM não configurado")
		return
	}

	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}

	prod, err := h.store.GetCatalogProduct(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "produto não encontrado")
		return
	}

	// Vocabulário existente (top 50 categorias) — para reutilização
	cats, _ := h.store.ListTaxonomy("category")
	var vocab []string
	for _, c := range cats {
		vocab = append(vocab, c.Name)
	}
	if len(vocab) > 50 {
		vocab = vocab[:50]
	}

	brand := ""
	if prod.Brand.Valid {
		brand = prod.Brand.String
	}
	price := 0.0
	if prod.LowestPrice.Valid {
		price = prod.LowestPrice.Float64
	}
	currentTags := strings.Join(prod.GetTags(), ", ")

	prompt := fmt.Sprintf(`Você é especialista em SEO e classificação de produtos para e-commerce brasileiro.

PRODUTO:
- Título: "%s"
- Marca: "%s"
- Preço: R$ %.2f
- Tags atuais: [%s]

VOCABULÁRIO EXISTENTE (use estas tags quando aplicável): %s

Sugira 5-10 tags relevantes em pt-BR. Tags devem capturar:
- Categoria mais específica
- Atributo principal (ex: peso, sabor, cor)
- Tipo de uso ou benefício
- Marca (se notável)

Responda EXCLUSIVAMENTE em JSON:
{
  "tags": ["tag1", "tag2", ...],
  "new_tags": ["tag-nova-1", ...]
}

new_tags: subconjunto de tags que NÃO estão no vocabulário existente.`,
		prod.CanonicalName, brand, price, currentTags, strings.Join(vocab, ", "),
	)

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resp, err := cli.Complete(ctx, prompt, llm.Options{
		MaxTokens:   300,
		Temperature: 0.3,
		Operation:   "suggest_tags",
		JSONMode:    true,
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "LLM: "+err.Error())
		return
	}

	var result map[string]any
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		writeErr(w, http.StatusBadGateway, "LLM resposta inválida")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ListBrands GET /api/catalog/brands
// Retorna brands distintas em uso em produtos ativos (não filtra por taxonomy aprovada).
// Útil pro dropdown de filtro do catálogo: mostra TUDO que existe.
func (h *CatalogHandler) ListBrands(w http.ResponseWriter, r *http.Request) {
	if h.db == nil {
		writeJSON(w, http.StatusOK, []string{})
		return
	}
	type row struct {
		Name string `db:"name"`
	}
	var rows []row
	err := h.db.SelectContext(r.Context(), &rows, `
		SELECT DISTINCT brand AS name
		FROM catalogproduct
		WHERE brand IS NOT NULL AND brand <> '' AND inactive = false
		ORDER BY brand`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Name)
	}
	writeJSON(w, http.StatusOK, out)
}

// ListCategories GET /api/catalog/categories
// Retorna categorias (tags) distintas em uso em produtos ativos.
func (h *CatalogHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	if h.db == nil {
		writeJSON(w, http.StatusOK, []string{})
		return
	}
	// catalogproduct.tags é JSON array string. Extrai elementos via jsonb.
	type row struct {
		Tag string `db:"tag"`
	}
	var rows []row
	err := h.db.SelectContext(r.Context(), &rows, `
		SELECT DISTINCT jsonb_array_elements_text(tags::jsonb) AS tag
		FROM catalogproduct
		WHERE tags IS NOT NULL AND tags <> '' AND tags <> '[]'
		  AND inactive = false
		ORDER BY tag`)
	if err != nil {
		// fallback gracioso (caso tags esteja como TEXT, não JSON)
		writeJSON(w, http.StatusOK, []string{})
		return
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if r.Tag != "" {
			out = append(out, r.Tag)
		}
	}
	writeJSON(w, http.StatusOK, out)
}
