package handlers

import (
	"net/http"
	"strings"

	"snatcher/backendv2/internal/store"
)

// ShortLinkRedirect resolve /v/{shortID} → affiliate URL com tracking de cliques.
func ShortLinkRedirect(st store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		shortID := r.PathValue("shortID")

		destURL, source, found := st.GetShortLinkByID(shortID)
		if !found {
			v, ok, err := st.GetVariantByShortID(shortID)
			if err != nil || !ok {
				http.Redirect(w, r, "/", http.StatusFound)
				return
			}
			destURL = v.URL
			source = v.Source
		}

		finalURL := destURL
		switch source {
		case "amazon":
			aff, ok, _ := st.GetAffiliateBySource("amz")
			if ok && aff.TrackingID != "" {
				sep := "?"; if strings.Contains(destURL, "?") { sep = "&" }
				finalURL = destURL + sep + "tag=" + aff.TrackingID
			}
		case "mercadolivre":
			aff, ok, _ := st.GetAffiliateBySource("ml")
			if ok && aff.TrackingID != "" {
				sep := "?"; if strings.Contains(destURL, "?") { sep = "&" }
				finalURL = destURL + sep + "matt_tool=" + aff.TrackingID + "&matt_source=affiliate"
			}
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.Redirect(w, r, finalURL, http.StatusFound)
	}
}

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
	source := strings.ToLower(req.Source)

	// Normalizar source para interno (amazon → amz, mercadolivre → ml)
	switch source {
	case "amazon":
		source = "amazon"
	case "mercadolivre", "ml":
		source = "mercadolivre"
	}

	shortID, err := h.store.GetOrCreateShortLink(req.URL, source)
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
