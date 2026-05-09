package admin

import (
	"net/http"
	"strings"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/store"
)

type LinksHandler struct {
	store store.Store
}

func NewLinksHandler(st store.Store) *LinksHandler {
	return &LinksHandler{store: st}
}

// Shorten cria um short link rastreável para uma URL de produto com afiliado embutido.
// POST /api/links/shorten
// Body: { "url": "https://amazon.com.br/dp/...", "source": "amazon" }
// Retorna: { "short_url": "https://jon.promo/v/{short_id}" }
func (h *LinksHandler) Shorten(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL    string `json:"url"`
		Source string `json:"source"`
	}
	if err := decodeBody(r, &req); err != nil || req.URL == "" {
		writeErr(w, http.StatusBadRequest, "url required")
		return
	}
	sourceMeta := strings.ToLower(strings.TrimSpace(req.Source))

	// Normalizar rótulo gravado em short_links.source (analytics)
	switch sourceMeta {
	case "amazon", "amz":
		sourceMeta = "amazon"
	case "mercadolivre", "ml":
		sourceMeta = "mercadolivre"
	}

	dest := strings.TrimSpace(req.URL)
	buildMarketplace := strings.TrimSpace(req.Source)
	if buildMarketplace == "" {
		buildMarketplace = affiliates.InferMarketplaceFromProductURL(dest)
	}
	if buildMarketplace == "" {
		buildMarketplace = "amazon"
	}
	programs, _ := h.store.ListAffiliatePrograms(nil)
	built, _, _ := affiliates.BuildLink(dest, buildMarketplace, programs)
	dest = built

	if sourceMeta == "" {
		sourceMeta = affiliates.CanonicalAffiliateMarketplace(buildMarketplace)
	}

	shortID, err := h.store.GetOrCreateShortLink(dest, sourceMeta)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "erro ao criar short link")
		return
	}

	// Buscar domínio configurado
	cfg, _ := h.store.GetConfig()
	domain := "beta.autibequi.com"
	if cfg.AppDomain.Valid && cfg.AppDomain.String != "" {
		domain = cfg.AppDomain.String
	}

	shortURL := "https://" + domain + "/v/" + shortID
	writeJSON(w, http.StatusOK, map[string]string{
		"short_url": shortURL,
		"short_id":  shortID,
	})
}
