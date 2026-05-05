package public

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
				sep := "?"
				if strings.Contains(destURL, "?") {
					sep = "&"
				}
				finalURL = destURL + sep + "tag=" + aff.TrackingID
			}
		case "mercadolivre":
			aff, ok, _ := st.GetAffiliateBySource("ml")
			if ok && aff.TrackingID != "" {
				sep := "?"
				if strings.Contains(destURL, "?") {
					sep = "&"
				}
				finalURL = destURL + sep + "matt_tool=" + aff.TrackingID + "&matt_source=affiliate"
			}
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.Redirect(w, r, finalURL, http.StatusFound)
	}
}
