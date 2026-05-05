package handlers

import (
	"fmt"
	"html"
	"net/http"
	"snatcher/backendv2/internal/store"
)

type CanalHandler struct {
	store store.Store
}

func NewCanal(st store.Store) *CanalHandler {
	return &CanalHandler{store: st}
}

func (h *CanalHandler) GroupPicker(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	ch, err := h.store.GetChannelBySlug(slug)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	targets, _ := h.store.ListChannelTargets(ch.ID)

	// Filtra targets com invite_url
	var withInvite []struct {
		Name      string
		InviteURL string
		Provider  string
	}
	for _, t := range targets {
		if t.Status == "ok" && t.InviteURL.Valid && t.InviteURL.String != "" {
			name := t.ChatID
			if t.Name.Valid && t.Name.String != "" {
				name = t.Name.String
			}
			withInvite = append(withInvite, struct {
				Name      string
				InviteURL string
				Provider  string
			}{Name: name, InviteURL: t.InviteURL.String, Provider: t.Provider})
		}
	}

	channelName := html.EscapeString(ch.Name)
	channelDesc := html.EscapeString(ch.Description)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	switch len(withInvite) {
	case 0:
		fmt.Fprintf(w, emptyHTML, channelName, channelDesc, channelName, channelDesc)

	case 1:
		t := withInvite[0]
		fmt.Fprintf(w, redirectHTML,
			channelName, channelDesc,
			html.EscapeString(t.InviteURL),
			html.EscapeString(t.InviteURL),
			html.EscapeString(t.InviteURL),
			channelName,
		)

	default:
		buttons := ""
		for _, t := range withInvite {
			icon := "💬"
			if t.Provider == "telegram" {
				icon = "✈️"
			}
			buttons += fmt.Sprintf(
				`<a class="btn" href="%s">%s %s</a>`,
				html.EscapeString(t.InviteURL), icon, html.EscapeString(t.Name),
			)
		}
		fmt.Fprintf(w, pickerHTML, channelName, channelDesc, channelName, channelDesc, buttons)
	}
}

func (h *CanalHandler) Preview(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	ch, err := h.store.GetChannelBySlug(slug)
	if err != nil {
		writeErr(w, http.StatusNotFound, "channel not found")
		return
	}
	targets, _ := h.store.ListChannelTargets(ch.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"channel": ch,
		"targets": targets,
	})
}

func (h *CanalHandler) JoinRedirect(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	http.Redirect(w, r, "/canal/"+slug, http.StatusMovedPermanently)
}

// ---------------------------------------------------------------------------
// Templates HTML (espelhando canal.py do Python)
// ---------------------------------------------------------------------------

const emptyHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<style>
  body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}
  .card{background:#fff;border-radius:12px;padding:2rem;text-align:center;max-width:400px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  h1{font-size:1.4rem;margin-bottom:.5rem}
  p{color:#666}
</style>
</head>
<body>
<div class="card">
  <h1>%s</h1>
  <p>%s</p>
  <p style="margin-top:1.5rem;font-size:.9rem;color:#999">Links em breve...</p>
</div>
</body>
</html>`

const redirectHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
</head>
<body>
<script>
  window.location.href = "%s";
</script>
<noscript>
  <meta http-equiv="refresh" content="0;url=%s">
  <p>Redirecionando para <a href="%s">%s</a>...</p>
</noscript>
</body>
</html>`

const pickerHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<style>
  body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}
  .card{background:#fff;border-radius:12px;padding:2rem;text-align:center;max-width:400px;box-shadow:0 2px 8px rgba(0,0,0,.1);width:100%%}
  h1{font-size:1.4rem;margin-bottom:.5rem}
  p{color:#666;margin-bottom:1.5rem}
  .btn{display:block;margin:.5rem 0;padding:.8rem 1.2rem;border-radius:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:600}
  .btn:hover{opacity:.9}
</style>
</head>
<body>
<div class="card">
  <h1>%s</h1>
  <p>%s</p>
  %s
</div>
</body>
</html>`
