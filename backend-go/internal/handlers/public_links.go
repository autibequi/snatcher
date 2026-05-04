package handlers

import (
	"encoding/json"
	"net/http"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
)

type PublicLinksHandler struct {
	store store.Store
}

func NewPublicLinksHandler(st store.Store) *PublicLinksHandler {
	return &PublicLinksHandler{store: st}
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
