package handlers

import (
	"context"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"snatcher/backendv2/internal/invitelinks"
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

	type pickerEntry struct {
		Name      string
		InviteURL string
		Provider  string
	}
	var withInvite []pickerEntry

	// 1) Grupos modernos (tabela groups / RedesignGroup) — fonte primária
	groups, _ := h.store.ListRedesignGroups(ch.ID, "", "active")

	ctx, cancel := context.WithTimeout(r.Context(), 50*time.Second)
	defer cancel()

	for _, g := range groups {
		invite := ""
		if g.InviteLink.Valid {
			invite = strings.TrimSpace(g.InviteLink.String)
		}
		// Sem invite persistido: tenta buscar na Evolution na hora (persiste no banco para próximas visitas).
		if invite == "" && g.Platform == "whatsapp" && g.Status == "active" &&
			g.JID.Valid && strings.TrimSpace(g.JID.String) != "" && g.WAAccountID.Valid {
			if link, err := h.store.FetchAndPersistWhatsAppInvite(ctx, g.ID); err == nil && link != "" {
				invite = link
			}
		}
		if invite == "" {
			continue
		}
		name := g.Name
		if name == "" {
			name = "Grupo"
		}
		u := invite
		if g.Platform == "whatsapp" {
			u = invitelinks.NormalizeWhatsAppInvite(u)
		}
		withInvite = append(withInvite, pickerEntry{
			Name:      name,
			InviteURL: u,
			Provider:  g.Platform,
		})
	}

	// 2) Fallback legacy: channel_targets (compat com setups antigos)
	if len(withInvite) == 0 {
		targets, _ := h.store.ListChannelTargets(ch.ID)
		for _, t := range targets {
			if t.Status == "ok" && t.InviteURL.Valid && t.InviteURL.String != "" {
				name := t.ChatID
				if t.Name.Valid && t.Name.String != "" {
					name = t.Name.String
				}
				withInvite = append(withInvite, pickerEntry{
					Name:      name,
					InviteURL: t.InviteURL.String,
					Provider:  t.Provider,
				})
			}
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
			html.EscapeString(t.InviteURL),       // script setTimeout
			html.EscapeString(t.Name),            // strong em "grupo X"
			html.EscapeString(t.InviteURL),       // noscript meta refresh
			html.EscapeString(t.InviteURL),       // noscript link href
		)

	default:
		buttons := ""
		for _, t := range withInvite {
			cls := "btn-wa"
			icon := "💬"
			if t.Provider == "telegram" {
				cls = "btn-tg"
				icon = "✈️"
			}
			buttons += fmt.Sprintf(
				`<a class="btn %s" href="%s"><span class="btn-icon">%s</span> <span>%s</span></a>`,
				cls, html.EscapeString(t.InviteURL), icon, html.EscapeString(t.Name),
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

const baseStyles = `
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem;background:linear-gradient(135deg,#0f172a 0%%,#1e293b 100%%);color:#e2e8f0}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:2rem;text-align:center;max-width:440px;width:100%%;box-shadow:0 20px 50px rgba(0,0,0,.4)}
  .badge{display:inline-block;padding:.25rem .6rem;border-radius:999px;font-size:.7rem;font-weight:600;margin-bottom:1rem;letter-spacing:.05em;text-transform:uppercase}
  h1{font-size:1.6rem;margin:0 0 .5rem;color:#f8fafc;font-weight:700}
  .desc{color:#94a3b8;margin:0 0 1.75rem;font-size:.95rem;line-height:1.5}
  .btn{display:flex;align-items:center;justify-content:center;gap:.6rem;margin:.6rem 0;padding:.95rem 1.2rem;border-radius:12px;color:#fff;text-decoration:none;font-weight:600;font-size:.95rem;transition:transform .15s ease,box-shadow .15s ease}
  .btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(0,0,0,.3)}
  .btn-wa{background:linear-gradient(135deg,#25D366 0%%,#128C7E 100%%)}
  .btn-tg{background:linear-gradient(135deg,#0088cc 0%%,#0066a3 100%%)}
  .btn-icon{font-size:1.15rem}
  .footer{margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid #334155;font-size:.75rem;color:#64748b}
  .pulse{display:inline-block;width:8px;height:8px;background:#25D366;border-radius:50%%;margin-right:.4rem;animation:pulse 2s ease-in-out infinite}
  @keyframes pulse{0%%,100%%{opacity:1}50%%{opacity:.5}}
`

const emptyHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<style>` + baseStyles + `
  .card-empty{opacity:.95}
  .icon{font-size:3rem;margin-bottom:1rem}
</style>
</head>
<body>
<div class="card card-empty">
  <div class="icon">⏳</div>
  <h1>%s</h1>
  <p class="desc">%s</p>
  <p class="footer"><span class="pulse"></span>Preparando os grupos para você. Volte em alguns instantes.</p>
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
<style>` + baseStyles + `
  .icon{font-size:3rem;margin-bottom:.5rem}
  .spinner{width:32px;height:32px;border:3px solid #334155;border-top-color:#25D366;border-radius:50%%;margin:1rem auto 0;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
<script>setTimeout(function(){window.location.href="%s"},800);</script>
</head>
<body>
<div class="card">
  <div class="icon">🚀</div>
  <h1>Entrando…</h1>
  <p class="desc">Você será redirecionado pro grupo <strong>%s</strong> em segundos.</p>
  <div class="spinner"></div>
  <noscript>
    <meta http-equiv="refresh" content="0;url=%s">
    <p style="margin-top:1rem"><a href="%s" style="color:#25D366">Clique aqui se não for redirecionado</a></p>
  </noscript>
</div>
</body>
</html>`

const pickerHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<style>` + baseStyles + `
  .icon{font-size:2.5rem;margin-bottom:.5rem}
  .count{display:inline-block;padding:.2rem .5rem;background:#0f172a;border:1px solid #334155;border-radius:999px;font-size:.7rem;color:#94a3b8;margin-left:.4rem}
  .group-list{display:flex;flex-direction:column;gap:.5rem;margin-top:.5rem}
</style>
</head>
<body>
<div class="card">
  <div class="icon">💬</div>
  <h1>%s</h1>
  <p class="desc">%s</p>
  <div class="group-list">
    %s
  </div>
  <p class="footer">Escolha um grupo para entrar agora.</p>
</div>
</body>
</html>`
