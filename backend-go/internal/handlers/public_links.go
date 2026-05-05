package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
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

// Resolve godoc
// GET /g/:slug (PUBLICO — sem auth)
func (h *PublicLinksHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	link, err := h.store.GetPublicLinkBySlug(slug)
	if err != nil {
		http.Error(w, "Link nao encontrado", http.StatusNotFound)
		return
	}

	var chain []int64
	_ = json.Unmarshal(link.FallbackChain, &chain)
	if len(chain) == 0 {
		http.Error(w, "<html><body><h2>Este canal esta fora do ar, volte logo.</h2></body></html>", http.StatusGone)
		return
	}

	// Resolver destino pelo strategy
	var targetGroupID int64
	switch link.RedirectStrategy {
	case "round_robin":
		idx := link.RoundRobinIdx % len(chain)
		targetGroupID = chain[idx]
		_ = h.store.IncrementRoundRobinIdx(link.ID, (idx+1)%len(chain))
	case "least_full":
		targetGroupID = chain[0]
		minCount := int64(^uint64(0) >> 1)
		for _, gid := range chain {
			g, err := h.store.GetRedesignGroup(gid)
			if err == nil && g.Status == "active" && g.MemberCount < minCount {
				minCount = g.MemberCount
				targetGroupID = gid
			}
		}
	default: // first_active
		targetGroupID = chain[0]
		for _, gid := range chain {
			g, err := h.store.GetRedesignGroup(gid)
			if err == nil && g.Status == "active" {
				targetGroupID = gid
				break
			}
		}
	}

	// Buscar invite_link do grupo
	group, err := h.store.GetRedesignGroup(targetGroupID)
	if err != nil || !group.InviteLink.Valid || group.InviteLink.String == "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusGone)
		_, _ = w.Write([]byte("<html><body><h2>Canal temporariamente indisponivel, volte logo.</h2></body></html>"))
		return
	}

	http.Redirect(w, r, group.InviteLink.String, http.StatusFound)
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

	// clicksDaily: clicks únicos por dia dos últimos 7 dias via clicklog.
	// Estratégia: a fallback_chain contém group_ids; grupos estão ligados a products via dispatches.
	// Agregamos clicklog por product_id onde o produto foi despachado para grupos da chain,
	// usando clicked_at para o agrupamento diário.
	// Se não houver dados suficientes → retorna zeros honestos.
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
				// Contar clicks únicos (DISTINCT ip_hash) no clicklog para produtos
				// despachados para grupos desta public link.
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

			// revenue via dispatch_targets (ainda é a fonte para revenue)
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

	// CTR: clicks / link.Clicks30d (proxy para impressões) — se sem impressões retorna 0.0
	// TODO: substituir por impressões reais quando rastreamento de views estiver disponível.
	ctr7d := 0.0
	if link.Clicks30d > 0 {
		// Aproximação: clicks_7d / (clicks_30d / 30 * 7) = clicks_total_7d * 30 / (clicks_30d * 7)
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
