package public

import (
	"net/http"

	"snatcher/backendv2/internal/affiliates"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/store"
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
			w.Header().Set("Cache-Control", "no-cache")
			http.Redirect(w, r, destURL, http.StatusFound)
			return
		}

		v, ok, err := st.GetVariantByShortID(shortID)
		if err != nil || !ok {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		programs, _ := st.ListAffiliatePrograms(nil)
		finalURL, _, _ := affiliates.BuildLink(v.URL, v.Source, programs)
		w.Header().Set("Cache-Control", "no-cache")
		http.Redirect(w, r, finalURL, http.StatusFound)
	}
}
