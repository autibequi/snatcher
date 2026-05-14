package public

import (
	"net/http"

	"snatcher/backendv2/internal/services/redirect"
	store "snatcher/backendv2/internal/repositories"
)

// ShortLinkRedirect resolve /v/{shortID} → URL final de afiliado.
//
// Registros em short_links já gravam dest_url após affiliates.BuildLink (tag/MLcdn/etc.);
// não reaplicar a tabela affiliates legada — evita tag errada, duplicada ou matt_tool em URL MLcdn.
// Fallback catalogvariant: monta afiliado via BuildLink + programas da UI.
func ShortLinkRedirect(st store.Store, rd *redirect.Redirector) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		shortID := r.PathValue("shortID")

		destURL, _, found := st.PeekShortLinkByID(shortID)
		if found {
			rd.EnqueueClickLog(r, shortID)
			if redirect.WriteHTMLRedirectWithGTM(w, redirect.GTMContainerID(st), destURL) {
				return
			}
			redirect.SetProductRedirectCacheHeaders(w.Header())
			http.Redirect(w, r, destURL, http.StatusFound)
			return
		}

		// GetVariantByShortID removido — redirect via /r/:shortID
		http.Redirect(w, r, "/", http.StatusFound)
	}
}
