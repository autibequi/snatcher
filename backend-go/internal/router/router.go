package router

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	_ "snatcher/backendv2/internal/docs" // swagger docs
	"snatcher/backendv2/internal/compose"
	"snatcher/backendv2/internal/handlers"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/middleware"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/store"
	wsmod "snatcher/backendv2/internal/ws"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jmoiron/sqlx"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	httpSwagger "github.com/swaggo/http-swagger"
)

func Build(
	db *sqlx.DB,
	st store.Store,
	rd *redirect.Redirector,
	runner *pipeline.Runner,
	sched *scheduler.Scheduler,
	scrapers map[string]pipeline.Scraper,
	adapters pipeline.AdapterRegistry,
	jwtSecret string,
) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(requestIDLogger)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.CleanPath)                              // normaliza // e remove trailing slash
	r.Use(middleware.CORS)
	r.Use(chimw.Timeout(30 * time.Second))              // global request timeout
	r.Use(middleware.BodyLimit(1 << 20))                // global 1 MB body limit
	r.Use(middleware.MetricsMiddleware)

	auth := handlers.NewAuthHandler(db, jwtSecret)
	scan := handlers.NewScan(st, runner, sched)
	terms := handlers.NewSearchTerms(st, scrapers)
	sources := handlers.NewSources(st)
	affiliates := handlers.NewAffiliates(st)
	catalog := handlers.NewCatalog(st)
	channels := handlers.NewChannels(st, adapters)
	config := handlers.NewConfig(st)
	canal := handlers.NewCanal(st)
	accounts := handlers.NewAccounts(st)
	crawlLogs := handlers.NewCrawlLogs(st)
	broadcast := handlers.NewBroadcast(st)
	analytics := handlers.NewAnalytics(st)
	coverage := handlers.NewCoverageHandler(st)
	dispatches := handlers.NewDispatchHandler(st)

	// ReDesign handlers
	groups      := handlers.NewGroupsHandler(st)
	matchH      := handlers.NewMatchHandler(st)
	publLinks   := handlers.NewPublicLinksHandler(st)
	affPrograms := handlers.NewAffiliateProgramsHandler(st)
	groupSpies  := handlers.NewGroupSpiesHandler(st)
	clustersH   := handlers.NewClustersHandler(st)
	dash        := handlers.NewDashboardHandler(st, db)
	team        := handlers.NewTeamHandler(db)
	brand       := handlers.NewBrandHandler(st)

	// Compose (LLM) — usa NopClient se OPENROUTER_API_KEY não configurado
	var composeH *handlers.ComposeHandler
	{
		var llmCli llm.Client = &nopLLMClient{}
		svc := compose.NewService(llmCli)
		composeH = handlers.NewComposeHandler(st, svc)
	}

	// WebSocket hub + handler
	hub := wsmod.NewHub()
	wsHandler := wsmod.NewHandler(hub, jwtSecret)
	go hub.StartListener(context.Background(), "") // DSN vazio = no-op silencioso

	// ---------------------------------------------------------------------------
	// Rota de métricas (pública — antes do grupo JWT)
	// ---------------------------------------------------------------------------
	r.Handle("/metrics", promhttp.Handler())

	// ---------------------------------------------------------------------------
	// OpenAPI / Swagger UI
	// ---------------------------------------------------------------------------
	r.Get("/api/swagger", func(w http.ResponseWriter, req *http.Request) {
		http.Redirect(w, req, "/api/swagger/index.html", http.StatusFound)
	})
	r.Get("/api/swagger/", func(w http.ResponseWriter, req *http.Request) {
		http.Redirect(w, req, "/api/swagger/index.html", http.StatusFound)
	})
	r.Get("/api/swagger/*", httpSwagger.Handler(httpSwagger.URL("/api/swagger/doc.json")))

	// ---------------------------------------------------------------------------
	// Rotas públicas
	// ---------------------------------------------------------------------------
	postbackH := handlers.NewAffiliatePostbackHandler(db)
	r.Post("/webhooks/affiliate/{programId}", postbackH.Handle)

	r.Get("/api/health", healthHandler)
	r.Get("/api/brand", brand.Get) // white-label public config

	// /api/auth/login: 5 req/min per IP (burst 5) — brute-force protection
	r.With(middleware.RateLimit(5.0/60.0, 5)).Post("/api/auth/login", auth.Login)
	r.Post("/api/auth/refresh", auth.Refresh)
	r.Post("/api/auth/logout", auth.Logout)

	// Redirect routes: 60 req/min per IP (burst 60) — light DoS protection
	r.With(middleware.RateLimit(60.0/60.0, 60)).Get("/r/{shortID}", rd.Handler())
	// Redirect para variantes do catálogo v2
	r.With(middleware.RateLimit(60.0/60.0, 60)).Get("/v/{shortID}", func(w http.ResponseWriter, r *http.Request) {
		shortID := r.PathValue("shortID")
		v, found, err := st.GetVariantByShortID(shortID)
		if err != nil || !found {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		// Affiliate URL
		finalURL := v.URL
		switch v.Source {
		case "amazon":
			aff, found, _ := st.GetAffiliateBySource("amz")
			if found && aff.TrackingID != "" {
				finalURL = v.URL + "?tag=" + aff.TrackingID
			}
		case "mercadolivre":
			aff, found, _ := st.GetAffiliateBySource("ml")
			if found && aff.TrackingID != "" {
				sep := "?"
				if strings.Contains(v.URL, "?") {
					sep = "&"
				}
				finalURL = v.URL + sep + "matt_tool=" + aff.TrackingID + "&matt_source=affiliate"
			}
		}
		w.Header().Set("Cache-Control", "public, max-age=3600")
		http.Redirect(w, r, finalURL, http.StatusFound)
	})

	r.Get("/canal/{slug}", canal.GroupPicker)
	r.Get("/canal/{slug}/preview", canal.Preview)
	r.Get("/join/{slug}", canal.JoinRedirect)

	// ReDesign: public link resolve + WebSocket (auth via query param token)
	r.Get("/g/{slug}", publLinks.Resolve)
	r.Get("/ws", wsHandler.ServeHTTP)

	r.Get("/api/public/channels", func(w http.ResponseWriter, r *http.Request) {
		chs, _ := st.ListChannels()
		type channelSummary struct {
			ID           int64  `json:"id"`
			Name         string `json:"name"`
			Slug         any    `json:"slug"`
			TargetsCount int    `json:"targets_count"`
		}
		var out []channelSummary
		for _, c := range chs {
			if !c.Active {
				continue
			}
			targets, _ := st.ListChannelTargets(c.ID)
			var slug any
			if c.Slug.Valid {
				slug = c.Slug.String
			}
			out = append(out, channelSummary{
				ID: c.ID, Name: c.Name, Slug: slug, TargetsCount: len(targets),
			})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})

	// QR + health públicos
	r.Get("/api/accounts/wa/{id}/qr", accounts.WAQR)
	r.Get("/api/accounts/wa/health", accounts.WAHealth)

	// ---------------------------------------------------------------------------
	// Rotas protegidas
	// ---------------------------------------------------------------------------
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(jwtSecret))

		// Auth
		r.Get("/api/auth/me", auth.Me)

		// Scan
		r.Get("/api/scan/status", scan.Status)
		r.Get("/api/scan/jobs", scan.ListJobs)
		r.Post("/api/scan/pipeline", scan.TriggerPipeline)
		r.Post("/api/scan/process", scan.TriggerProcess)

		// Sources
		r.Get("/api/sources", sources.List)
		r.Get("/api/sources/", sources.List)
		r.Get("/api/sources/{id}", sources.Get)
		r.Patch("/api/sources/{id}", sources.Update)

		// Affiliates
		r.Get("/api/affiliates", affiliates.List)
		r.Get("/api/affiliates/", affiliates.List)
		r.Get("/api/affiliates/{id}", affiliates.Get)
		r.Post("/api/affiliates", affiliates.Create)
		r.Post("/api/affiliates/", affiliates.Create)
		r.Put("/api/affiliates/{id}", affiliates.Update)
		r.Delete("/api/affiliates/{id}", affiliates.Delete)

		// Search Terms (com e sem trailing slash)
		r.Get("/api/search-terms", terms.List)
		r.Get("/api/search-terms/", terms.List)
		r.Get("/api/search-terms/{id}", terms.Get)
		r.Post("/api/search-terms", terms.Create)
		r.Post("/api/search-terms/", terms.Create)
		r.Put("/api/search-terms/{id}", terms.Update)
		r.Delete("/api/search-terms/{id}", terms.Delete)
		r.Post("/api/search-terms/{id}/crawl", terms.CrawlNow)
		r.Get("/api/search-terms/{id}/results", terms.ListResults)

		// Catalog
		r.Get("/api/catalog", catalog.List)
		r.Get("/api/catalog/", catalog.List)
		r.Get("/api/catalog/{id}", catalog.Get)
		r.Put("/api/catalog/{id}", catalog.Update)
		r.Delete("/api/catalog/{id}", catalog.Delete)
		r.Get("/api/catalog/variants/{id}/stats", catalog.VariantStats)
		r.Get("/api/catalog/variants/{variant_id}/history", catalog.ListVariantHistory)
		r.Get("/api/catalog/keywords", catalog.ListKeywords)
		r.Get("/api/catalog/keywords/", catalog.ListKeywords)

		// Channels
		r.Get("/api/channels", channels.List)
		r.Get("/api/channels/", channels.List)
		r.Get("/api/channels/{id}", channels.Get)
		r.Post("/api/channels", channels.Create)
		r.Post("/api/channels/", channels.Create)
		r.Put("/api/channels/{id}", channels.Update)
		r.Delete("/api/channels/{id}", channels.Delete)
		r.Post("/api/channels/{id}/targets", channels.CreateTarget)
		r.Patch("/api/channels/{id}/targets/{target_id}", channels.UpdateTarget)
		r.Delete("/api/channels/{id}/targets/{target_id}", channels.DeleteTarget)
		r.Post("/api/channels/{id}/rules", channels.CreateRule)
		r.Delete("/api/channels/{id}/rules/{rule_id}", channels.DeleteRule)
		r.Post("/api/channels/{id}/send-digest", channels.SendDigest)
		r.Post("/api/channels/{id}/send-product", channels.SendProduct)

		// Config
		r.Get("/api/config", config.Get)
		r.Put("/api/config", config.Update)

		// Accounts — WhatsApp
		r.Get("/api/accounts/wa", accounts.ListWA)
		r.Post("/api/accounts/wa", accounts.CreateWA)
		r.Get("/api/accounts/wa/{id}", accounts.GetWA)
		r.Put("/api/accounts/wa/{id}", accounts.UpdateWA)
		r.Delete("/api/accounts/wa/{id}", accounts.DeleteWA)
		r.Get("/api/accounts/wa/{id}/status", accounts.WAStatus)
		r.Post("/api/accounts/wa/{id}/session/start", accounts.WAStartSession)
		r.Post("/api/accounts/wa/{id}/session/logout", accounts.WAStartSession)
		r.Get("/api/accounts/wa/{id}/groups", accounts.WAGroups)
		r.Post("/api/accounts/wa/{id}/groups", accounts.WACreateGroup)

		// Accounts — Telegram
		r.Get("/api/accounts/tg", accounts.ListTG)
		r.Post("/api/accounts/tg", accounts.CreateTG)
		r.Put("/api/accounts/tg/{id}", accounts.UpdateTG)
		r.Delete("/api/accounts/tg/{id}", accounts.DeleteTG)

		// Crawl logs
		r.Get("/api/crawl-logs", crawlLogs.List)
		r.Get("/api/crawl-logs/", crawlLogs.List)

		// Broadcast
		r.Get("/api/broadcast", broadcast.List)
		r.Get("/api/broadcast/", broadcast.List)
		r.Post("/api/broadcast", broadcast.Create)
		r.Post("/api/broadcast/", broadcast.Create)

		// Analytics
		r.Get("/api/analytics/summary", analytics.Summary)

		// Coverage (multi-WA)
		r.Get("/api/coverage", coverage.GetCoverage)
		r.Post("/api/coverage/sync", coverage.PostCoverageSync)

		// Telegram chats discovery (dois paths — o frontend usa /api/config/tg/chats)
		r.Get("/api/telegram/chats", accounts.ListTGChats)
		r.Get("/api/config/tg/chats", accounts.ListTGChats)

		// Legacy v1 groups (alias mantido para compatibilidade)
		r.Get("/api/groups/legacy", accounts.ListGroups)

		// ReDesign: Groups
		r.Get("/api/groups", groups.List)
		r.Post("/api/groups", groups.Create)
		r.Get("/api/groups/{id}", groups.Get)
		r.Patch("/api/groups/{id}", groups.Update)
		r.Delete("/api/groups/{id}", groups.Delete)
		r.Get("/api/groups/{id}/members", groups.Members)

		// ReDesign: Match
		r.Post("/api/match", matchH.Match)

		// ReDesign: Compose
		r.Post("/api/compose/preview", composeH.Preview)

		// ReDesign: Dispatches
		r.Get("/api/dispatches", dispatches.List)
		r.Post("/api/dispatches", dispatches.Create)
		r.Get("/api/dispatches/{id}", dispatches.Get)
		r.Post("/api/dispatches/{id}/cancel", dispatches.Cancel)

		// ReDesign: Public Links (autenticado — gestão)
		r.Get("/api/public-links", publLinks.List)
		r.Post("/api/public-links", publLinks.Create)
		r.Get("/api/public-links/{id}", publLinks.Get)
		r.Patch("/api/public-links/{id}", publLinks.Update)
		r.Delete("/api/public-links/{id}", publLinks.Delete)

		// ReDesign: Affiliate Programs
		r.Get("/api/affiliates/programs", affPrograms.List)
		r.Post("/api/affiliates/programs", affPrograms.Create)
		r.Get("/api/affiliates/programs/{id}", affPrograms.Get)
		r.Delete("/api/affiliates/programs/{id}", affPrograms.Delete)
		r.Post("/api/affiliates/build-link", affPrograms.BuildLink)

		// ReDesign: Channels extras (audience + metrics)
		r.Get("/api/channels/{id}/audience", channels.GetAudience)
		r.Get("/api/channels/{id}/metrics", channels.GetMetrics)
		r.Get("/api/channels/{id}/history", channels.GetHistory)

		// Crawlers: Group Spies
		r.Get("/api/crawlers/group-spy", groupSpies.List)
		r.Post("/api/crawlers/group-spy", groupSpies.Create)
		r.Get("/api/crawlers/group-spy/{id}", groupSpies.Get)
		r.Delete("/api/crawlers/group-spy/{id}", groupSpies.Delete)

		// Clusters analíticos
		r.Get("/api/clusters", clustersH.List)
		r.Post("/api/clusters/recompute", clustersH.Recompute)

		// Dashboard
		r.Get("/api/dashboard/kpis", dash.KPIs)
		r.Get("/api/dashboard/feed", dash.Feed)
		r.Get("/api/dashboard/inbox", dash.Inbox)
		r.Get("/api/dashboard/performance", dash.Performance)

		// Team (operadores)
		r.Get("/api/team", team.List)
		r.Post("/api/team", team.Invite)
		r.Patch("/api/team/{id}/role", team.UpdateRole)
		r.Delete("/api/team/{id}", team.Remove)

		// Admin: LLM observability
		llmAdmin := handlers.NewLLMAdminHandler(db)
		r.Get("/api/admin/llm/usage", llmAdmin.Usage)
		r.Get("/api/admin/llm/budgets", llmAdmin.ListBudgets)
		r.Patch("/api/admin/llm/budgets/{op}", llmAdmin.UpdateBudget)
		r.Post("/api/admin/llm/budgets/{op}/reset", llmAdmin.ResetBudget)
	})

	return r
}

// requestIDLogger is a middleware that extracts the request ID set by
// chimw.RequestID and injects it into the default slog logger so that all
// subsequent log calls within the request carry the "request_id" field.
func requestIDLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := chimw.GetReqID(r.Context())
		if reqID != "" {
			logger := slog.Default().With("request_id", reqID)
			// Store the per-request logger in the context so handlers can
			// retrieve it with slog.Default() after SetDefault — or use it
			// directly via contextLogger(r.Context()).
			ctx := r.Context()
			r = r.WithContext(withLogger(ctx, logger))
		}
		next.ServeHTTP(w, r)
	})
}

type loggerKeyType struct{}

var loggerKey = loggerKeyType{}

// withLogger stores a *slog.Logger in the context.
func withLogger(ctx context.Context, l *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerKey, l)
}

// LoggerFromContext retrieves the per-request slog.Logger stored by
// requestIDLogger, falling back to slog.Default() if none is present.
func LoggerFromContext(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(loggerKey).(*slog.Logger); ok && l != nil {
		return l
	}
	return slog.Default()
}

// healthHandler verifica a saúde da aplicação.
//
//	@Summary      Health check
//	@Description  Verifica se o servidor está no ar.
//	@Tags         health
//	@Produce      json
//	@Success      200  {object}  object{status=string}
//	@Router       /api/health [get]
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// nopLLMClient é um cliente LLM nulo usado quando OPENROUTER_API_KEY não está configurado.
// Compose handlers retornam fallback em vez de erro fatal.
type nopLLMClient struct{}

func (n *nopLLMClient) Complete(_ context.Context, _ string, _ llm.Options) (string, error) {
	return "", fmt.Errorf("LLM not configured: set OPENROUTER_API_KEY to enable compose")
}
