package admin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"snatcher/backendv2/internal/models"
	store "snatcher/backendv2/internal/repositories"

	"github.com/jmoiron/sqlx"
)

type PublicLinksHandler struct {
	store store.Store
	db    *sqlx.DB
}

func NewPublicLinksHandler(st store.Store) *PublicLinksHandler {
	return &PublicLinksHandler{store: st}
}

// NewPublicLinksHandlerDB cria o handler com acesso direto ao DB para queries analíticas.
func NewPublicLinksHandlerDB(st store.Store, db *sqlx.DB) *PublicLinksHandler {
	return &PublicLinksHandler{store: st, db: db}
}

// List godoc
// GET /api/public-links (autenticado)
func (h *PublicLinksHandler) List(w http.ResponseWriter, r *http.Request) {
	links, err := h.store.ListPublicLinks()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao listar links")
		return
	}
	if links == nil {
		links = []models.PublicLink{}
	}
	// Filtra por channel_id se fornecido
	if chStr := r.URL.Query().Get("channel_id"); chStr != "" {
		var chID int64
		if _, err := fmt.Sscan(chStr, &chID); err == nil && chID > 0 {
			filtered := links[:0]
			for _, l := range links {
				if l.ChannelID == chID {
					filtered = append(filtered, l)
				}
			}
			links = filtered
		}
	}
	writeJSON(w, http.StatusOK, links)
}

// Create godoc
// POST /api/public-links
func (h *PublicLinksHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Slug             string  `json:"slug" validate:"required"`
		ChannelID        int64   `json:"channel_id" validate:"required"`
		FallbackChain    []int64 `json:"fallback_chain"`
		RedirectStrategy string  `json:"redirect_strategy"`
	}
	if err := decodeAndValidate(r, &req); err != nil {
		writeValidationErr(w, err)
		return
	}
	chain, _ := json.Marshal(req.FallbackChain)
	link := models.PublicLink{
		Slug:             req.Slug,
		ChannelID:        req.ChannelID,
		FallbackChain:    chain,
		RedirectStrategy: req.RedirectStrategy,
		Active:           true,
	}
	id, err := h.store.CreatePublicLink(link)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar link")
		return
	}
	link.ID = id
	writeJSON(w, http.StatusCreated, link)
}

// Get godoc
// GET /api/public-links/:id
func (h *PublicLinksHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	link, err := h.store.GetPublicLink(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "link nao encontrado")
		return
	}
	writeJSON(w, http.StatusOK, link)
}

// Update godoc
// PATCH /api/public-links/:id
func (h *PublicLinksHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	existing, err := h.store.GetPublicLink(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "link nao encontrado")
		return
	}
	var req struct {
		FallbackChain    []int64 `json:"fallback_chain"`
		RedirectStrategy string  `json:"redirect_strategy"`
		Active           *bool   `json:"active"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.FallbackChain != nil {
		chain, _ := json.Marshal(req.FallbackChain)
		existing.FallbackChain = chain
	}
	if req.RedirectStrategy != "" {
		existing.RedirectStrategy = req.RedirectStrategy
	}
	if req.Active != nil {
		existing.Active = *req.Active
	}
	if err := h.store.UpdatePublicLink(existing); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao atualizar link")
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

// Delete godoc
// DELETE /api/public-links/:id
func (h *PublicLinksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.store.DeletePublicLink(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao deletar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Analytics retorna métricas analíticas de um public link nos últimos 7 dias.
//
//	@Summary      Analíticas de public link
//	@Description  Retorna clicks diários, total de clicks, CTR e receita dos últimos 7 dias.
//	@Tags         public-links
//	@Produce      json
//	@Param        id   path      int  true  "PublicLink ID"
//	@Success      200  {object}  object{clicks_daily_7d=[]int,clicks_total_7d=int,ctr_7d=number,revenue_7d=number}
//	@Failure      400  {object}  object{error=string}
//	@Failure      404  {object}  object{error=string}
//	@Security     BearerAuth
//	@Router       /api/public-links/{id}/analytics [get]
func (h *PublicLinksHandler) Analytics(w http.ResponseWriter, r *http.Request) {
	id, ok := pathInt(r, "id")
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	link, err := h.store.GetPublicLink(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "link nao encontrado")
		return
	}

	clicksDaily := [7]int{}
	var clicksTotal int
	var revenue float64

	if h.db != nil {
		var chainIDs []int64
		_ = json.Unmarshal(link.FallbackChain, &chainIDs)

		if len(chainIDs) > 0 {
			now := time.Now()
			for i := 0; i < 7; i++ {
				dayStart := now.Add(-time.Duration(6-i) * 24 * time.Hour).Truncate(24 * time.Hour)
				dayEnd := dayStart.Add(24 * time.Hour)
				var dayClicks int
				_ = h.db.GetContext(r.Context(), &dayClicks,
					`SELECT COUNT(DISTINCT cl.ip_hash)
					 FROM clicklog cl
					 JOIN dispatches d ON d.product_id = cl.product_id
					 JOIN dispatch_targets dt ON dt.dispatch_id = d.id AND dt.group_id = ANY($1)
					 WHERE cl.clicked_at >= $2 AND cl.clicked_at < $3`,
					chainIDs, dayStart, dayEnd)
				clicksDaily[i] = dayClicks
				clicksTotal += dayClicks
			}

			for i := 0; i < 7; i++ {
				dayStart := now.Add(-time.Duration(6-i) * 24 * time.Hour).Truncate(24 * time.Hour)
				dayEnd := dayStart.Add(24 * time.Hour)
				var dayRevenue float64
				_ = h.db.GetContext(r.Context(), &dayRevenue,
					`SELECT COALESCE(SUM(dt.revenue), 0.0)
					 FROM dispatch_targets dt
					 WHERE dt.group_id = ANY($1)
					   AND dt.delivered_at >= $2 AND dt.delivered_at < $3`,
					chainIDs, dayStart, dayEnd)
				revenue += dayRevenue
			}
		}
	}

	ctr7d := 0.0
	if link.Clicks30d > 0 {
		impressions7d := float64(link.Clicks30d) / 30.0 * 7.0
		if impressions7d > 0 {
			ctr7d = float64(clicksTotal) / impressions7d
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"clicks_daily_7d": clicksDaily[:],
		"clicks_total_7d": clicksTotal,
		"ctr_7d":          ctr7d,
		"revenue_7d":      revenue,
	})
}
