package admin

import (
	"net/http"
	"time"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"

	"github.com/jmoiron/sqlx"
)

type AffiliateProgramsHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewAffiliateProgramsHandler(st store.Store) *AffiliateProgramsHandler {
	return &AffiliateProgramsHandler{store: st}
}

// NewAffiliateProgramsHandlerDB cria o handler com acesso direto ao DB para queries analíticas.
func NewAffiliateProgramsHandlerDB(st store.Store, db *sqlx.DB) *AffiliateProgramsHandler {
	return &AffiliateProgramsHandler{store: st, db: db}
}

// List retorna todos os programas de afiliado.
func (h *AffiliateProgramsHandler) List(w http.ResponseWriter, r *http.Request) {
	programs, err := h.store.ListAffiliatePrograms(nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar programas")
		return
	}
	if programs == nil {
		programs = []models.AffiliateProgram{}
	}
	writeJSON(w, http.StatusOK, programs)
}

// Get retorna um programa de afiliado por ID.
func (h *AffiliateProgramsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	p, err := h.store.GetAffiliateProgram(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "programa nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// Create cria um novo programa de afiliado.
func (h *AffiliateProgramsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name" validate:"required"`
		Marketplace string `json:"marketplace" validate:"required"`
		Active      *bool  `json:"active"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	p := models.AffiliateProgram{
		Name:        req.Name,
		Marketplace: req.Marketplace,
		Active:      active,
		Credentials: []byte("{}"),
		Rules:       []byte("{}"),
		Postback:    []byte("{}"),
	}
	id, err := h.store.CreateAffiliateProgram(p)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar programa")
		return
	}
	p.ID = id
	writeJSON(w, http.StatusCreated, p)
}

// Delete deleta um programa de afiliado.
func (h *AffiliateProgramsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeleteAffiliateProgram(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Stats retorna estatísticas agregadas por programa de afiliado.
//
//	@Summary      Stats por programa de afiliado
//	@Description  Retorna clicks_30d, conversions_30d, revenue_30d e last_sync_at por programa.
//	@Tags         affiliates
//	@Produce      json
//	@Success      200  {array}   object{id=int,name=string,marketplace=string,clicks_30d=int,conversions_30d=int,revenue_30d=number,last_sync_at=string}
//	@Security     BearerAuth
//	@Router       /api/affiliates/programs/stats [get]
func (h *AffiliateProgramsHandler) Stats(w http.ResponseWriter, r *http.Request) {
	programs, err := h.store.ListAffiliatePrograms(nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar programas")
		return
	}

	type programStats struct {
		ID             int64   `json:"id"`
		Name           string  `json:"name"`
		Marketplace    string  `json:"marketplace"`
		Active         bool    `json:"active"`
		Clicks30d      int     `json:"clicks_30d"`
		Conversions30d int     `json:"conversions_30d"`
		Revenue30d     float64 `json:"revenue_30d"`
		LastSyncAt     *string `json:"last_sync_at"`
	}

	since30d := time.Now().Add(-30 * 24 * time.Hour)

	out := make([]programStats, 0, len(programs))
	for _, p := range programs {
		stats := programStats{
			ID:          p.ID,
			Name:        p.Name,
			Marketplace: p.Marketplace,
			Active:      p.Active,
		}

		if h.db != nil {
			// clicks_30d: clicks do clicklog para produtos cujo source == marketplace do programa
			_ = h.db.GetContext(r.Context(), &stats.Clicks30d,
				`SELECT COUNT(*) FROM clicklog cl
				 JOIN product pr ON pr.id = cl.product_id
				 WHERE pr.source = $1 AND cl.clicked_at >= $2`,
				p.Marketplace, since30d)

			// conversions_30d: conversões registradas na tabela affiliate_conversions
			_ = h.db.GetContext(r.Context(), &stats.Conversions30d,
				`SELECT COUNT(*) FROM affiliate_conversions
				 WHERE program_id = $1 AND created_at >= $2`, p.ID, since30d)

			// revenue_30d: soma de revenue das conversões aprovadas
			_ = h.db.GetContext(r.Context(), &stats.Revenue30d,
				`SELECT COALESCE(SUM(revenue), 0.0) FROM affiliate_conversions
				 WHERE program_id = $1 AND status = 'approved' AND created_at >= $2`, p.ID, since30d)

			// last_sync_at: MAX(created_at) das conversões do programa
			var lastSync *string
			type lastSyncRow struct {
				LastSync *string `db:"last_sync"`
			}
			var row lastSyncRow
			_ = h.db.GetContext(r.Context(), &row,
				`SELECT to_char(MAX(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_sync
				 FROM affiliate_conversions WHERE program_id = $1`, p.ID)
			lastSync = row.LastSync
			stats.LastSyncAt = lastSync
		}

		out = append(out, stats)
	}

	writeJSON(w, http.StatusOK, out)
}

// BuildLink constrói o link de afiliado para um produto.
//
// POST /api/affiliates/build-link
func (h *AffiliateProgramsHandler) BuildLink(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductURL  string `json:"product_url" validate:"required"`
		Marketplace string `json:"marketplace" validate:"required"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	programs, err := h.store.ListAffiliateProgramsByMarketplace(req.Marketplace)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao buscar programas")
		return
	}
	link, programName, err := affiliates.BuildLink(req.ProductURL, req.Marketplace, programs)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao construir link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": link, "program": programName})
}

// CheckCoverage GET /api/affiliates/coverage?marketplace=amazon
// Retorna se há programa configurado e com credenciais para o marketplace.
func (h *AffiliateProgramsHandler) CheckCoverage(w http.ResponseWriter, r *http.Request) {
	marketplace := r.URL.Query().Get("marketplace")
	if marketplace == "" {
		writeErr(w, http.StatusBadRequest, "marketplace obrigatório")
		return
	}
	programs, _ := h.store.ListAffiliatePrograms(nil)
	writeJSON(w, http.StatusOK, map[string]any{
		"marketplace":   marketplace,
		"has_affiliate": affiliates.HasAffiliate(marketplace, programs),
	})
}
