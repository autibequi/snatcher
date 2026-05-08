package router

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	_ "snatcher/backendv2/internal/docs" // swagger docs
	"snatcher/backendv2/internal/compose"
	"snatcher/backendv2/internal/handlers"
	adminhnd "snatcher/backendv2/internal/handlers/admin"
	publichnd "snatcher/backendv2/internal/handlers/public"
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
	// Inicializa persistência de métricas de LLM em llm_metrics
	llm.SetMetricsDB(db)

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

	auth := adminhnd.NewAuthHandler(db, jwtSecret)
	scan := adminhnd.NewScan(st, runner, sched)
	terms := adminhnd.NewSearchTerms(st, scrapers)
	// LLM injected after composeH is created below
	sources := adminhnd.NewSources(st)
	affiliates := adminhnd.NewAffiliates(st)
	catalog := adminhnd.NewCatalogDB(st, db)
	channels := adminhnd.NewChannels(st, adapters)
	config := adminhnd.NewConfig(st)
	canal := handlers.NewCanal(st)
	accounts := adminhnd.NewAccounts(st)
	crawlLogs := adminhnd.NewCrawlLogs(st)
	broadcast := adminhnd.NewBroadcast(st)
	analytics := adminhnd.NewAnalytics(st)
	coverage := adminhnd.NewCoverageHandler(st)
	dispatches := adminhnd.NewDispatchHandler(st, db)

	// ReDesign handlers
	groups      := adminhnd.NewGroupsHandler(st)
	matchH      := adminhnd.NewMatchHandler(st)
	publLinks   := adminhnd.NewPublicLinksHandlerDB(st, db)
	publLinksResolver := publichnd.NewPublicLinksResolver(st)
	affPrograms := adminhnd.NewAffiliateProgramsHandlerDB(st, db)
	groupSpies  := adminhnd.NewGroupSpiesHandler(st)
	clustersH   := adminhnd.NewClustersHandlerDB(st, db)
	dash        := adminhnd.NewDashboardHandler(st, db)
	team        := adminhnd.NewTeamHandler(db)
	brand       := adminhnd.NewBrandHandler(st)
	taxonomy    := adminhnd.NewTaxonomyHandler(st)
	curation    := adminhnd.NewCurationHandler(st, db, nil) // llmFn preenchido abaixo após composeH
	autoMatch   := adminhnd.NewAutoMatchHandler(st)
	linksH      := adminhnd.NewLinksHandler(st)
	automations := adminhnd.NewAutomationsHandler(st)
	jonfrey     := adminhnd.NewJonfreyHandler(st, db)
	ads         := adminhnd.NewAdsHandler(st)

	// Compose (LLM) — usa NopClient se OPENROUTER_API_KEY não configurado
	var composeH *adminhnd.ComposeHandler
	{
		var llmCli llm.Client = &nopLLMClient{}
		svc := compose.NewService(llmCli)
		composeH = adminhnd.NewComposeHandler(st, svc)
	}
	// Injeta factory LLM nos handlers que precisam
	terms.SetLLMFn(composeH.BuildLLMClient)
	channels.SetLLMFn(composeH.BuildLLMClient)
	curation.SetLLMFn(composeH.BuildLLMClient)
	dash.SetLLMFn(composeH.BuildLLMClient)
	dispatches.SetLLMFn(composeH.BuildLLMClient)
	automations.SetLLMFn(composeH.BuildLLMClient)
	taxonomy.SetLLMFn(composeH.BuildLLMClient)
	groups.SetLLMFn(composeH.BuildLLMClient)
	catalog.SetLLMFn(composeH.BuildLLMClient)
	jonfrey.SetLLMFn(composeH.BuildLLMClient)
	jonfrey.SetCurationHandler(curation)

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
	postbackH := adminhnd.NewAffiliatePostbackHandlerStore(db, st)
	r.Post("/webhooks/affiliate/{programId}", postbackH.Handle)
	evoWebhook := adminhnd.NewEvolutionWebhookHandler(st)
	r.Post("/webhooks/evolution", evoWebhook.Handle)

	r.Get("/api/health", healthHandler)
	r.Get("/api/brand", brand.Get) // white-label public config

	// Setup (first-run): cria o primeiro admin se nenhum usuário existir
	setup := adminhnd.NewSetupHandler(db)
	r.Get("/api/setup/status", setup.Status)
	r.Post("/api/setup/create-admin", setup.CreateAdmin)

	// /api/auth/login: 5 req/min per IP (burst 5) — brute-force protection
	r.With(middleware.RateLimit(5.0/60.0, 5)).Post("/api/auth/login", auth.Login)
	r.Post("/api/auth/refresh", auth.Refresh)
	r.Post("/api/auth/logout", auth.Logout)

	r.With(middleware.RateLimit(60.0/60.0, 60)).Get("/r/{shortID}", rd.Handler())
	r.With(middleware.RateLimit(60.0/60.0, 120)).Get("/v/{shortID}", publichnd.ShortLinkRedirect(st)) // Coolify: nginx → backend:8000

	// Serve arquivos de upload (imagens dos anúncios pagos, etc.)
	r.Get("/uploads/*", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/uploads/", http.FileServer(http.Dir("/data/uploads"))).ServeHTTP(w, req)
	})

	r.Get("/canal/{slug}", canal.GroupPicker)
	r.Get("/canal/{slug}/preview", canal.Preview)
	r.Get("/join/{slug}", canal.JoinRedirect)

	// ReDesign: public link resolve + WebSocket (auth via query param token)
	r.Get("/g/{slug}", publLinksResolver.Resolve)
	r.Get("/ws", wsHandler.ServeHTTP)

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
		r.Get("/api/me", auth.Me) // alias canônico (handoff de design)

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
		r.Post("/api/search-terms/suggest", terms.Suggest)
		r.Get("/api/search-terms/{id}/results", terms.ListResults)

		// Catalog
		r.Get("/api/catalog", catalog.List)
		r.Get("/api/catalog/", catalog.List)
		r.Get("/api/catalog/search", catalog.Search)
		r.Get("/api/catalog/brands", catalog.ListBrands)
		r.Get("/api/catalog/categories", catalog.ListCategories)
		r.Get("/api/catalog/{id}", catalog.Get)
		r.Put("/api/catalog/{id}", catalog.Update)
		r.Patch("/api/catalog/{id}", catalog.PatchCurationStatus)
		r.Post("/api/catalog/{id}/suggest-tags", catalog.SuggestTags)
		// Reprocess pode demorar minutos em catálogos grandes — sobrescreve timeout global de 30s
		r.With(chimw.Timeout(10 * time.Minute)).Post("/api/catalog/reprocess", catalog.Reprocess)
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
		r.Get("/api/channels/{id}/rules", channels.ListRules)
		r.Post("/api/channels/{id}/rules", channels.CreateRule)
		r.Put("/api/channels/{id}/rules/{rule_id}", channels.UpdateRule)
		r.Delete("/api/channels/{id}/rules/{rule_id}", channels.DeleteRule)
		r.Post("/api/channels/{id}/send-digest", channels.SendDigest)
		r.Post("/api/channels/{id}/send-product", channels.SendProduct)
		r.Post("/api/channels/suggest", channels.Suggest)

		// Automations
		r.Get("/api/automations", automations.List)
		r.Get("/api/automations/{channelId}", automations.Get)
		r.Put("/api/automations/{channelId}", automations.Upsert)
		r.Get("/api/automations/{channelId}/preview", automations.Preview)
		r.Post("/api/automations/{channelId}/advise", automations.Advise)

		// Jonfrey — orquestrador AI das automações
		// Upload de imagens
		r.Post("/api/uploads/image", adminhnd.UploadImage)

		// Ads — disparos recorrentes pagos
		r.Get("/api/ads", ads.List)
		r.Post("/api/ads", ads.Create)
		r.Get("/api/ads/{id}", ads.Get)
		r.Patch("/api/ads/{id}", ads.Update)
		r.Delete("/api/ads/{id}", ads.Delete)

		r.Get("/api/jonfrey/actions", jonfrey.ListActions)
		r.Get("/api/jonfrey/available", jonfrey.ListAvailable)
		r.Post("/api/jonfrey/run", jonfrey.RunAction)
		r.Get("/api/jonfrey/config", jonfrey.GetConfig)
		r.Put("/api/jonfrey/config", jonfrey.UpdateConfig)

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
		r.Post("/api/groups/{id}/suggest-audience", groups.SuggestAudience)
		r.Post("/api/groups/{id}/fetch-invite", groups.FetchInvite)
		r.Post("/api/groups/{id}/archive", groups.Archive)
		r.Get("/api/groups/{id}/admins", groups.ListAdmins)
		r.Post("/api/groups/{id}/admins", groups.AddAdmin)
		r.Delete("/api/groups/{id}/admins/{adminId}", groups.DeleteAdmin)

		// ReDesign: Match
		r.Post("/api/match", matchH.Match)

		// Taxonomy (categorias e marcas para autocomplete + admin)
		r.Get("/api/taxonomy", taxonomy.List)
		r.Get("/api/taxonomy/pending", taxonomy.ListPending)
		r.Post("/api/taxonomy/suggest", taxonomy.Suggest)
		r.Post("/api/taxonomy", taxonomy.Create)
		r.Patch("/api/taxonomy/{id}", taxonomy.Update)
		r.Delete("/api/taxonomy/{id}", taxonomy.Delete)
		r.Post("/api/taxonomy/{id}/approve", taxonomy.Approve)
		r.Post("/api/taxonomy/{id}/reject", taxonomy.Reject)

		// Curation — produtos sem inferência automática (cadastro manual)
		r.Get("/api/curation/needs-taxonomy", curation.List)
		r.Get("/api/curation/stats", curation.Stats)
		r.Patch("/api/curation/{id}/taxonomy", curation.AssignTaxonomy)
		r.Post("/api/curation/{id}/reject", curation.Reject)
		r.Post("/api/curation/auto-heuristic", curation.AutoHeuristic)
		// AutoLLM e InspectAll são async — handler retorna 202 imediatamente, job roda em goroutine
		r.Post("/api/curation/auto-llm", curation.AutoLLM)
		r.Post("/api/curation/inspect-all", curation.InspectAll)

		// Auto Match
		r.Get("/api/auto-match", autoMatch.Status)
		r.Get("/api/auto-match/preview", autoMatch.Preview)
		r.Post("/api/auto-match/toggle", autoMatch.Toggle)
		r.Post("/api/auto-match/run-now", autoMatch.RunNow)
		r.Post("/api/auto-match/dispatch-one", autoMatch.DispatchOne)

		// Short Links
		r.Post("/api/links/shorten", linksH.Shorten)

		// ReDesign: Compose
		r.Post("/api/compose/preview", composeH.Preview)

		// ReDesign: Dispatches
		r.Get("/api/dispatches", dispatches.List)
		r.Post("/api/dispatches", dispatches.Create)
		r.Get("/api/dispatches/{id}", dispatches.Get)
		r.Post("/api/dispatches/{id}/cancel", dispatches.Cancel)
		r.Get("/api/dispatches/pending-approval", dispatches.ListPendingApproval)
		r.Post("/api/dispatches/approve-all", dispatches.ApproveAllDispatch)
		r.Post("/api/dispatches/approve-batch", dispatches.ApproveBatch)
		r.Post("/api/dispatches/expire-stale", dispatches.ExpireStaleTargets)
		r.Post("/api/dispatches/{id}/diagnose", dispatches.Diagnose)
		r.Post("/api/dispatches/{id}/approve", dispatches.ApproveDispatch)
		r.Post("/api/dispatches/{id}/reject", dispatches.RejectDispatch)

		// ReDesign: Public Links (autenticado — gestão)
		r.Get("/api/public-links", publLinks.List)
		r.Post("/api/public-links", publLinks.Create)
		r.Get("/api/public-links/{id}", publLinks.Get)
		r.Patch("/api/public-links/{id}", publLinks.Update)
		r.Delete("/api/public-links/{id}", publLinks.Delete)
		r.Get("/api/public-links/{id}/analytics", publLinks.Analytics)

		// ReDesign: Affiliate Programs
		r.Get("/api/affiliates/programs", affPrograms.List)
		r.Post("/api/affiliates/programs", affPrograms.Create)
		r.Get("/api/affiliates/programs/stats", affPrograms.Stats) // antes de /{id} — evita colisão
		r.Get("/api/affiliates/programs/{id}", affPrograms.Get)
		r.Delete("/api/affiliates/programs/{id}", affPrograms.Delete)
		r.Post("/api/affiliates/build-link", affPrograms.BuildLink)
		r.Get("/api/affiliates/coverage", affPrograms.CheckCoverage)

		// ReDesign: Channels extras (audience + metrics)
		r.Get("/api/channels/{id}/audience", channels.GetAudience)
		r.Get("/api/channels/{id}/metrics", channels.GetMetrics)
		r.Get("/api/channels/{id}/history", channels.GetHistory)

		// Crawlers: Group Spies
		r.Get("/api/crawlers/group-spy", groupSpies.List)
		r.Post("/api/crawlers/group-spy", groupSpies.Create)
		r.Get("/api/crawlers/group-spy/{id}", groupSpies.Get)
		r.Get("/api/crawlers/group-spy/{id}/messages", groupSpies.Messages)
		r.Delete("/api/crawlers/group-spy/{id}", groupSpies.Delete)
		r.Patch("/api/crawlers/group-spy/{id}", groupSpies.UpdateReader)

		// Clusters analíticos
		r.Get("/api/clusters", clustersH.List)
		r.Get("/api/clusters/{id}", clustersH.Get)
		r.Post("/api/clusters/recompute", clustersH.Recompute)

		// Dashboard
		r.Get("/api/dashboard/kpis", dash.KPIs)
		r.Get("/api/dashboard/feed", dash.Feed)
		r.Get("/api/dashboard/inbox", dash.Inbox)
		r.Get("/api/dashboard/performance", dash.Performance)
		r.Get("/api/dashboard/channel-performance", dash.Performance)
		r.Get("/api/dashboard/upcoming-dispatches", dash.UpcomingDispatches)
		r.Get("/api/dashboard/recommendation", dash.Recommendation)

		// Team (operadores)
		r.Get("/api/team", team.List)
		r.Post("/api/team", team.Invite)
		r.Patch("/api/team/{id}/role", team.UpdateRole)
		r.Delete("/api/team/{id}", team.Remove)

		// Jobs (background tasks)
		jobsHandler := adminhnd.NewJobsHandler()
		r.Get("/api/jobs", jobsHandler.List)
		r.Post("/api/jobs/{id}/cancel", jobsHandler.Cancel)
		r.Post("/api/jobs/clear", jobsHandler.Clear)
		r.Post("/api/jobs/cancel-all", jobsHandler.CancelAll)

		// Admin: LLM observability
		llmAdmin := adminhnd.NewLLMAdminHandler(db)
		r.Get("/api/admin/llm/usage", llmAdmin.Usage)
		r.Get("/api/admin/llm/logs", llmAdmin.Logs)
		r.Get("/api/admin/llm/ollama/models", llmAdmin.OllamaModels)
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
