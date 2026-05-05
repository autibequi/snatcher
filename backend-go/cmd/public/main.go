// cmd/public — servidor público do Snatcher.
// Serve apenas:
//   - / e /canais/:slug → home pública (lista de canais e grupos)
//   - /r/{shortID}      → redirect de produto com afiliado
//   - /g/{slug}         → redirect de link público (fallback chain)
//   - /canal/{slug}     → group picker (compatibilidade legada)
//
// Sem auth, sem API REST, sem Swagger. Isolado do admin.
package main

import (
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"snatcher/backendv2/internal/db"
	"snatcher/backendv2/internal/middleware"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/store"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://snatcher:devpass@snatcher-app-postgres:5432/snatcher?sslmode=disable"
	}
	port := os.Getenv("PUBLIC_PORT")
	if port == "" {
		port = "8001"
	}

	database, err := db.Open(dsn)
	if err != nil {
		slog.Error("open db", "err", err)
		os.Exit(1)
	}
	if err := db.RunMigrations(database); err != nil {
		slog.Error("migrations", "err", err)
		os.Exit(1)
	}

	st := store.New(database)
	rd := redirect.New(database, st)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(15 * time.Second))

	// ── Home: lista de canais ─────────────────────────────────────────────────
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		channels, _ := st.ListChannels()
		renderHome(w, channels)
	})

	// ── Detalhe de canal: lista de grupos ─────────────────────────────────────
	r.Get("/canais/{id}", func(w http.ResponseWriter, req *http.Request) {
		idStr := chi.URLParam(req, "id")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.NotFound(w, req)
			return
		}
		channel, err := st.GetChannel(id)
		if err != nil {
			http.NotFound(w, req)
			return
		}
		targets, _ := st.ListChannelTargets(id)
		renderChannel(w, channel, targets)
	})

	// ── Redirects ─────────────────────────────────────────────────────────────
	r.With(middleware.RateLimit(120.0/60.0, 60)).Get("/r/{shortID}", rd.Handler())
	r.Get("/g/{slug}", publicLinkHandler(st))
	r.Get("/canal/{slug}", canalHandler(st))
	r.Get("/join/{slug}", func(w http.ResponseWriter, req *http.Request) {
		slug := chi.URLParam(req, "slug")
		http.Redirect(w, req, "/canal/"+slug, http.StatusMovedPermanently)
	})

	// ── Health ────────────────────────────────────────────────────────────────
	r.Get("/health", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ok"}`)
	})

	slog.Info("public server starting", "port", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		slog.Error("listen", "err", err)
		os.Exit(1)
	}
}

// ── Public link redirect (/g/{slug}) ─────────────────────────────────────────

func publicLinkHandler(st store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")

		var link struct {
			ID              int64  `db:"id"`
			ChannelID       int64  `db:"channel_id"`
			FallbackChain   []byte `db:"fallback_chain"`
			RedirectStrategy string `db:"redirect_strategy"`
			Active          bool   `db:"active"`
		}

		// Buscar via store
		links, err := st.ListPublicLinks()
		if err != nil || len(links) == 0 {
			http.Error(w, "link not found", http.StatusNotFound)
			return
		}
		found := false
		for _, l := range links {
			if l.Slug == slug {
				link.ID = l.ID
				link.ChannelID = l.ChannelID
				link.FallbackChain = l.FallbackChain
				link.RedirectStrategy = l.RedirectStrategy
				link.Active = l.Active
				found = true
				break
			}
		}
		if !found || !link.Active {
			http.Error(w, "link not found or inactive", http.StatusNotFound)
			return
		}

		// Buscar grupos ativos do canal
		targets, _ := st.ListChannelTargets(link.ChannelID)
		for _, t := range targets {
			if t.Status == "ok" && t.InviteURL.Valid && t.InviteURL.String != "" {
				http.Redirect(w, r, t.InviteURL.String, http.StatusFound)
				return
			}
		}
		http.Error(w, "nenhum grupo ativo disponível", http.StatusGone)
	}
}

// ── Canal handler (/canal/{slug}) ────────────────────────────────────────────

func canalHandler(st store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		channel, err := st.GetChannelBySlug(slug)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		targets, _ := st.ListChannelTargets(channel.ID)
		// Redirecionar para primeiro grupo ativo
		for _, t := range targets {
			if t.Status == "ok" && t.InviteURL.Valid && t.InviteURL.String != "" {
				http.Redirect(w, r, t.InviteURL.String, http.StatusFound)
				return
			}
		}
		// Sem grupo ativo — mostrar página do canal
		renderChannel(w, channel, targets)
	}
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const homeCSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       background: #0f0f0f; color: #e0e0e0; min-height: 100vh; }
.container { max-width: 900px; margin: 0 auto; padding: 48px 24px; }
h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 40px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
        padding: 20px; text-decoration: none; color: inherit;
        transition: border-color .15s, transform .15s; display: block; }
.card:hover { border-color: #4f6ef7; transform: translateY(-2px); }
.card-name { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.card-desc { font-size: 13px; color: #888; margin-bottom: 14px; min-height: 18px; }
.card-meta { display: flex; gap: 12px; font-size: 12px; color: #666; }
.badge { background: #2a2a2a; border-radius: 6px; padding: 2px 8px; font-size: 11px; }
.active { color: #4ade80; }
.back { display: inline-flex; align-items: center; gap: 6px; color: #4f6ef7;
        text-decoration: none; font-size: 14px; margin-bottom: 32px; }
.back:hover { text-decoration: underline; }
.group-list { display: flex; flex-direction: column; gap: 12px; }
.group-item { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px;
              padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
.group-name { font-size: 15px; font-weight: 500; }
.group-meta { font-size: 12px; color: #888; margin-top: 3px; }
.btn { display: inline-block; background: #4f6ef7; color: #fff; border-radius: 8px;
       padding: 8px 16px; font-size: 13px; font-weight: 600; text-decoration: none; }
.btn:hover { background: #3d5ef0; }
.empty { color: #666; font-size: 14px; text-align: center; padding: 60px 0; }
`

var homeTemplate = template.Must(template.New("home").Parse(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Snatcher — Grupos de promoções</title>
<style>` + homeCSS + `</style>
</head>
<body>
<div class="container">
  <h1>Grupos de promoções</h1>
  <p class="subtitle">Escolha um canal de promoções para entrar nos grupos.</p>
  {{if .Channels}}
  <div class="grid">
    {{range .Channels}}
    <a class="card" href="/canais/{{.ID}}">
      <div class="card-name">{{.Name}}</div>
      <div class="card-desc">{{.Description}}</div>
      <div class="card-meta">
        {{if .Active}}<span class="active">● ativo</span>{{else}}<span>pausado</span>{{end}}
      </div>
    </a>
    {{end}}
  </div>
  {{else}}
  <p class="empty">Nenhum canal disponível no momento.</p>
  {{end}}
</div>
</body>
</html>`))

var channelTemplate = template.Must(template.New("channel").Parse(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{.Channel.Name}} — Snatcher</title>
<style>` + homeCSS + `</style>
</head>
<body>
<div class="container">
  <a class="back" href="/">← Todos os canais</a>
  <h1>{{.Channel.Name}}</h1>
  <p class="subtitle">{{.Channel.Description}}</p>
  {{if .Targets}}
  <div class="group-list">
    {{range .Targets}}
    <div class="group-item">
      <div>
        <div class="group-name">{{.Name.String}}</div>
        <div class="group-meta">{{.Provider}} · {{.Status}}</div>
      </div>
      {{if and (eq .Status "ok") .InviteURL.Valid}}
      <a class="btn" href="{{.InviteURL.String}}" target="_blank" rel="noopener">Entrar</a>
      {{end}}
    </div>
    {{end}}
  </div>
  {{else}}
  <p class="empty">Nenhum grupo disponível neste canal.</p>
  {{end}}
</div>
</body>
</html>`))

func renderHome(w http.ResponseWriter, channels interface{}) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	homeTemplate.Execute(w, map[string]interface{}{"Channels": channels})
}

func renderChannel(w http.ResponseWriter, channel interface{}, targets interface{}) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	channelTemplate.Execute(w, map[string]interface{}{
		"Channel": channel,
		"Targets": targets,
	})
}

var _ = strings.TrimSpace
