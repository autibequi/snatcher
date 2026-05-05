package handlers

import (
	"net/http"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"
	"strconv"
	"time"

	"github.com/jmoiron/sqlx"
)

type CatalogHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewCatalog(st store.Store) *CatalogHandler {
	return &CatalogHandler{store: st}
}

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
func (h *CatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 30
	}

	products, err := h.store.ListCatalogProducts(limit, offset)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if products == nil {
		products = []models.CatalogProduct{}
	}

	total, _ := h.store.CountCatalogProducts()
	resp := map[string]any{
		"items":  products,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	}

	// ?grouped_counts=1 — adiciona contagens por estado ao response.
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
