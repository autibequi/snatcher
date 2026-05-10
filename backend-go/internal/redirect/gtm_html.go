package redirect

import (
	"encoding/json"
	"html/template"
	"net/http"
	"os"
	"regexp"
	"strings"

	"snatcher/backendv2/internal/store"
)

var validGTMContainerID = regexp.MustCompile(`(?i)^GTM-[A-Z0-9]+$`)

// GTMContainerID lê appconfig.gtm_container_id com fallback para env GTM_CONTAINER_ID (igual a GET /api/brand).
func GTMContainerID(st store.Store) string {
	cfg, err := st.GetConfig()
	if err == nil && cfg.GTMContainerID.Valid {
		if s := strings.TrimSpace(cfg.GTMContainerID.String); s != "" {
			return s
		}
	}
	return strings.TrimSpace(os.Getenv("GTM_CONTAINER_ID"))
}

// WriteHTMLRedirectWithGTM responde 200 com HTML mínimo (snippet GTM oficial + redirect via JS).
// Retorna false se não houver GTM válido ou destino vazio — nesse caso o caller deve usar http.Redirect.
func WriteHTMLRedirectWithGTM(w http.ResponseWriter, gtmID, destURL string) bool {
	gtmID = strings.TrimSpace(gtmID)
	if gtmID == "" || !validGTMContainerID.MatchString(gtmID) || strings.TrimSpace(destURL) == "" {
		return false
	}

	destJSON, err := json.Marshal(destURL)
	if err != nil {
		return false
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Não cachear na CDN — cada clique deve poder disparar GTM / medição.
	w.Header().Set("Cache-Control", "private, no-store, max-age=0")

	data := struct {
		GTMID    string
		DestJSON template.JS
	}{
		GTMID:    gtmID,
		DestJSON: template.JS(destJSON),
	}

	if err := gtmRedirectTemplate.Execute(w, data); err != nil {
		return false
	}
	return true
}

// Snippet alinhado ao container GTM web + redirect imediato para o destino (afiliado / convite).
var gtmRedirectTemplate = template.Must(template.New("gtm_redirect").Parse(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Redirecionando…</title>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','{{.GTMID}}');</script>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={{.GTMID}}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<p style="font-family:system-ui,sans-serif;padding:1rem;color:#666;font-size:14px;">Redirecionando…</p>
<script>
(function(){
  var dest = {{.DestJSON}};
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'snatcher_redirect',
    page_location: window.location.href,
    redirect_url: dest
  });
  if (typeof dest === 'string' && dest.length > 0) {
    window.location.replace(dest);
  }
})();
</script>
</body>
</html>`))
