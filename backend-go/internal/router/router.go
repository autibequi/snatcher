package router

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	_ "snatcher/backendv2/internal/docs" // swagger docs
	"snatcher/backendv2/internal/compose"
	"snatcher/backendv2/internal/curator"
	"snatcher/backendv2/internal/handlers"
	adminhnd "snatcher/backendv2/internal/handlers/admin"
	publichnd "snatcher/backendv2/internal/handlers/public"
	webhookshnd "snatcher/backendv2/internal/handlers/public/webhooks"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/middleware"
	"snatcher/backendv2/internal/notifier"
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
	// LLM (OpenRouter/Ollama) e jobs longos usam r.Context(); 30s gerava "context deadline exceeded"
	// no POST /chat/completions. Handlers críticos ainda aplicam timeouts próprios mais curtos.
	r.Use(chimw.Timeout(5 * time.Minute))
	r.Use(middleware.BodyLimit(1 << 20))                // global 1 MB body limit
	r.Use(middleware.MetricsMiddleware)

	auth := adminhnd.NewAuthHandler(db, jwtSecret)
	scan := adminhnd.NewScan(st, runner, sched)
	terms := adminhnd.NewSearchTerms(st, scrapers)
	// LLM injected after composeH is created below
	sources := adminhnd.NewSources(st)
	affiliates := adminhnd.NewAffiliates(st)
	config := adminhnd.NewConfigWithDB(st, db)
	accounts := adminhnd.NewAccounts(st)
	crawlLogs := adminhnd.NewCrawlLogs(st)
	// ReDesign handlers
	groups      := adminhnd.NewGroupsHandler(st)
	publLinks   := adminhnd.NewPublicLinksHandlerDB(st, db)
	publLinksResolver := publichnd.NewPublicLinksResolver(st)
	affPrograms := adminhnd.NewAffiliateProgramsHandlerDB(st, db)
	groupSpies  := adminhnd.NewGroupSpiesHandler(st)
	dash        := adminhnd.NewDashboardHandler(st, db)
	team        := adminhnd.NewTeamHandler(db)
	brand       := adminhnd.NewBrandHandler(st)
	taxonomy      := adminhnd.NewTaxonomyHandler(st)
	linksH        := adminhnd.NewLinksHandler(st)
	jonfrey       := adminhnd.NewJonfreyHandler(st, db)
	// Notifier compartilhado: handlers + scheduler postam resumos no grupo
	// configurado em Settings → Notificações. Sem grupo configurado = no-op.
	notif := notifier.New(st)
	jonfrey.SetNotifier(notif)
	dash.SetNotifier(notif)
	if sched != nil {
		sched.SetNotifier(notif)
	}
	// Wire tick automático: scheduler chama jonfrey.RunCycle a cada 1min se enabled
	if sched != nil {
		sched.SetJonfreyTick(jonfrey.RunCycle)
	}
	// PR-1: triage-refactor handlers
	taxonomyPatterns := handlers.NewTaxonomyPattern(st)

	// Compose (LLM) — usa NopClient se OPENROUTER_API_KEY não configurado
	var composeH *adminhnd.ComposeHandler
	{
		var llmCli llm.Client = &nopLLMClient{}
		svc := compose.NewService(llmCli)
		composeH = adminhnd.NewComposeHandler(st, svc)
	}
	// Injeta factory LLM nos handlers que precisam
	terms.SetLLMFn(composeH.BuildLLMClient)
	dash.SetLLMFn(composeH.BuildLLMClient)
	taxonomy.SetLLMFn(composeH.BuildLLMClient)
	groups.SetLLMFn(composeH.BuildLLMClient)
	jonfrey.SetLLMFn(composeH.BuildLLMClient)

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
	// Conversion tracking webhooks (Fase 2)
	r.Post("/webhooks/awin", webhookshnd.HandleAwinPostback(db))
	r.Post("/webhooks/mercadolivre", webhookshnd.HandleMLPostback(db))

	// Fase 6: Curator WhatsApp webhook — mensagens dos grupos curador
	r.Post("/webhooks/curator", publichnd.CuratorWebhookHandler(db, curator.GlobalConfirmer, curator.GlobalSender))

	// Fase 8: Promo Bot webhook — respostas em grupos de promoção (stub)
	r.Post("/webhooks/promo-bot", publichnd.PromoBotWebhookHandler(db))

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
	r.With(middleware.RateLimit(60.0/60.0, 120)).Get("/v/{shortID}", publichnd.ShortLinkRedirect(st, rd)) // Coolify: nginx → backend:8000 + analytics (shortlink_clicks)

	// Serve arquivos de upload (imagens dos anúncios pagos, etc.)
	r.Get("/uploads/*", func(w http.ResponseWriter, req *http.Request) {
		http.StripPrefix("/uploads/", http.FileServer(http.Dir("/data/uploads"))).ServeHTTP(w, req)
	})

	// ReDesign: public link resolve + WebSocket (auth via query param token)
	r.Get("/g/{slug}", publLinksResolver.Resolve)
	r.Get("/ws", wsHandler.ServeHTTP)

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

		// Jonfrey — orquestrador AI das automações
		// Upload de imagens
		r.Post("/api/uploads/image", adminhnd.UploadImage)

		r.Get("/api/jonfrey/actions", jonfrey.ListActions)
		r.Get("/api/jonfrey/available", jonfrey.ListAvailable)
		r.Post("/api/jonfrey/run", jonfrey.RunAction)
		r.Get("/api/jonfrey/config", jonfrey.GetConfig)
		r.Put("/api/jonfrey/config", jonfrey.UpdateConfig)

		// Config
		r.Get("/api/config", config.Get)
		r.Put("/api/config", config.Update)
		r.Post("/api/config/full-auto-toggle", config.ToggleFullAuto)

		// Accounts — WhatsApp CRUD removido em F08. Use /api/admin/senders/* para accounts v2.

		// Crawl logs
		r.Get("/api/crawl-logs", crawlLogs.List)
		r.Get("/api/crawl-logs/", crawlLogs.List)

		// Analytics

		// Coverage (multi-WA)

		// Legacy v1 groups (alias mantido para compatibilidade)
		r.Get("/api/groups/legacy", accounts.ListGroups)

		// ReDesign: Groups
		r.Get("/api/groups", groups.List)
		r.Post("/api/groups", groups.Create)
		r.Get("/api/groups/{id}", groups.Get)
		r.Patch("/api/groups/{id}", groups.Update)
		r.Post("/api/groups/{id}/propagate-subject", groups.PropagateSubject)
		r.Delete("/api/groups/{id}", groups.Delete)
		r.Get("/api/groups/{id}/members", groups.Members)
		r.Post("/api/groups/{id}/suggest-audience", groups.SuggestAudience)
		r.Post("/api/groups/{id}/fetch-invite", groups.FetchInvite)
		r.Post("/api/groups/{id}/archive", groups.Archive)
		r.Get("/api/groups/{id}/admins", groups.ListAdmins)
		r.Post("/api/groups/{id}/admins", groups.AddAdmin)
		r.Delete("/api/groups/{id}/admins/{adminId}", groups.DeleteAdmin)

		// ReDesign: Match

		// Taxonomy (categorias e marcas para autocomplete + admin)
		r.Get("/api/taxonomy", taxonomy.List)
		r.Get("/api/taxonomy/pending", taxonomy.ListPending)
		r.Post("/api/taxonomy/suggest", taxonomy.Suggest)
		r.Post("/api/taxonomy", taxonomy.Create)
		r.Patch("/api/taxonomy/{id}", taxonomy.Update)
		r.Delete("/api/taxonomy/{id}", taxonomy.Delete)
		r.Post("/api/taxonomy/{id}/approve", taxonomy.Approve)
		r.Post("/api/taxonomy/{id}/reject", taxonomy.Reject)

		// PR-1: Taxonomy Patterns (triage-refactor)
		r.Get("/api/taxonomy/patterns", taxonomyPatterns.ListTaxonomyPatterns)
		r.Get("/api/taxonomy/patterns/active", taxonomyPatterns.ListAllActivePatterns)
		r.Get("/api/taxonomy/patterns/max-updated-at", taxonomyPatterns.MaxPatternUpdatedAt)

		// Short Links
		r.Post("/api/links/shorten", linksH.Shorten)

		// ReDesign: Compose
		r.Post("/api/compose/preview", composeH.Preview)

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
		r.Get("/api/affiliates/marketplace-catalog", affPrograms.MarketplaceCatalog)
		r.Get("/api/affiliates/programs/stats", affPrograms.Stats) // antes de /{id} — evita colisão
		r.Get("/api/affiliates/programs/{id}", affPrograms.Get)
		r.Patch("/api/affiliates/programs/{id}", affPrograms.Update)
		r.Delete("/api/affiliates/programs/{id}", affPrograms.Delete)
		r.Post("/api/affiliates/build-link", affPrograms.BuildLink)
		r.Get("/api/affiliates/coverage", affPrograms.CheckCoverage)

		// Crawlers: Group Spies
		r.Get("/api/crawlers/group-spy", groupSpies.List)
		r.Post("/api/crawlers/group-spy", groupSpies.Create)
		r.Get("/api/crawlers/group-spy/{id}", groupSpies.Get)
		r.Get("/api/crawlers/group-spy/{id}/messages", groupSpies.Messages)
		r.Delete("/api/crawlers/group-spy/{id}", groupSpies.Delete)
		r.Patch("/api/crawlers/group-spy/{id}", groupSpies.UpdateReader)

		// Clusters analíticos

		// Dashboard
		r.Get("/api/dashboard/kpis", dash.KPIs)
		r.Get("/api/dashboard/feed", dash.Feed)
		r.Get("/api/dashboard/inbox", dash.Inbox)
		r.Get("/api/dashboard/performance", dash.Performance)
		r.Get("/api/dashboard/channel-performance", dash.Performance)
		r.Get("/api/dashboard/upcoming-dispatches", dash.UpcomingDispatches)
		r.Get("/api/dashboard/recommendation", dash.Recommendation)
		r.Get("/api/dashboard/automation-diagnostics", dash.AutomationDiagnostics)

		// Team (operadores)
		r.Get("/api/team", team.List)
		r.Post("/api/team", team.Invite)
		r.Patch("/api/team/{id}/role", team.UpdateRole)
		r.Delete("/api/team/{id}", team.Remove)

		// Jobs (background tasks)
		jobsHandler := adminhnd.NewJobsHandler()
		workQueue := adminhnd.NewWorkQueueHandler(st)
		r.Get("/api/jobs", jobsHandler.List)
		r.Get("/api/work-queue", workQueue.Get)
		r.Post("/api/work-queue/clear", workQueue.Clear)
		r.Post("/api/jobs/{id}/cancel", jobsHandler.Cancel)
		r.Post("/api/jobs/clear", jobsHandler.Clear)
		r.Post("/api/jobs/cancel-all", jobsHandler.CancelAll)

		// Admin: LLM observability
		llmAdmin := adminhnd.NewLLMAdminHandler(db)
		r.Get("/api/admin/llm/usage", llmAdmin.Usage)
		r.Get("/api/admin/llm/cost-series", llmAdmin.CostSeries)
		r.Get("/api/admin/llm/logs", llmAdmin.Logs)
		r.Get("/api/admin/llm/ollama/models", llmAdmin.OllamaModels)
		r.Get("/api/admin/llm/vllm/models", llmAdmin.OllamaModels)
		r.Get("/api/admin/llm/budgets", llmAdmin.ListBudgets)
		r.Patch("/api/admin/llm/budgets/{op}", llmAdmin.UpdateBudget)
		r.Post("/api/admin/llm/budgets/{op}/reset", llmAdmin.ResetBudget)

		// Fase 2: Conversion tracking dashboard
		r.Get("/api/admin/conversions/by-group", adminhnd.ConversionsByGroupHandler(db))
		r.Get("/api/admin/conversions/recent", adminhnd.RecentConversionsHandler(db))
		r.Get("/api/admin/conversions/by-day", adminhnd.ConversionsByDayHandler(db))
		r.Get("/api/admin/conversions/by-source", adminhnd.ConversionsBySourceHandler(db))

		// Fase 3: Fold catalog — migra catalogvariant → catalog (one-shot manual)
		r.Post("/api/admin/fold-catalog", adminhnd.FoldCatalogHandler(db))

		// Fase 3b: Catalog Canônico — visualizar catalog cimentado (v2)
		r.Get("/api/admin/catalog-canonical/stats", adminhnd.CatalogCanonicalStatsHandler(db))
		r.Get("/api/admin/catalog-canonical", adminhnd.ListCatalogCanonicalHandler(db))

		// Fase 4: Senders — status dos modems e filas de envio
		r.Get("/api/admin/senders/status", adminhnd.SendersStatusHandler(db))
		r.Get("/api/admin/senders/accounts", adminhnd.SendersAccountsHandler(db))
		r.Post("/api/admin/modems/{id}/pause", adminhnd.PauseModemHandler(db))
		r.Post("/api/admin/modems/{id}/resume", adminhnd.ResumeModemHandler(db))

		// Fase 5: Loops LLM — status de autonomia e auditoria
		r.Get("/api/admin/loops/status", adminhnd.LoopsStatusHandler(db))
		r.Get("/api/admin/loops/{loop}/actions", adminhnd.LoopActionsHandler(db))
		r.Post("/api/admin/loops/{loop}/status", adminhnd.SetLoopStatusHandler(db))
		r.Post("/api/admin/loops/{loop}/reset_strikes", adminhnd.ResetStrikesHandler(db))

		// Fase 7: L4 suggestions dashboard — aprovar/rejeitar sugestões pendentes dos loops
		r.Get("/api/admin/suggestions", adminhnd.ListSuggestionsHandler(db))
		r.Post("/api/admin/suggestions/{id}/approve", adminhnd.ApproveSuggestionHandler(db))
		r.Post("/api/admin/suggestions/{id}/dismiss", adminhnd.DismissSuggestionHandler(db))

		// Fase 8: Diferenciais — status dos MVPs opcionais
		r.Get("/api/admin/diferenciais/status", adminhnd.DiferenciaisStatusHandler(db))

		// Fase 9: Tunable parameters — listar e editar parâmetros tunáveis
		r.Get("/api/admin/parameters", adminhnd.ListParamsHandler(db))
		r.Put("/api/admin/parameters/{id}", adminhnd.UpdateParamHandler(db))
		r.Post("/api/admin/parameters/{id}/reset", adminhnd.ResetParamHandler(db))

		// Fase 10: Audit timeline -- eventos operacionais consolidados
		r.Get("/api/admin/audit/timeline", adminhnd.AuditTimelineHandler(db))
		r.Get("/api/admin/audit/stats", adminhnd.AuditStatsHandler(db))

		// Scrapers admin — configs, health, logs, promote
		r.Get("/api/admin/scrapers/configs", adminhnd.ListScraperConfigsHandler(db))
		r.Put("/api/admin/scrapers/configs/{id}/selector", adminhnd.UpdateScraperSelectorHandler(db))
		r.Post("/api/admin/scrapers/configs/{id}/promote", adminhnd.PromoteShadowHandler(db))
		r.Get("/api/admin/scrapers/health", adminhnd.ScraperHealthHandler(db))
		r.Get("/api/admin/scrapers/logs", adminhnd.ExtractionLogsHandler(db))

		// Metrics dashboard — learned weights, daily metrics, A/B tests
		r.Get("/api/admin/metrics/learned-weights", adminhnd.LearnedWeightsHandler(db))
		r.Get("/api/admin/metrics/daily", adminhnd.DailyMetricsHandler(db))
		r.Get("/api/admin/metrics/ab-tests", adminhnd.ABTestsHandler(db))

		// Templates de mensagem — CRUD + toggle
		tmpl := adminhnd.NewTemplatesHandler(db)
		r.Get("/api/admin/templates", tmpl.List)
		r.Get("/api/admin/templates/categories", tmpl.ListCategories)
		r.Post("/api/admin/templates", tmpl.Create)
		r.Put("/api/admin/templates/{id}", tmpl.Update)
		r.Patch("/api/admin/templates/{id}/toggle", tmpl.Toggle)
		r.Delete("/api/admin/templates/{id}", tmpl.Delete)

		// Alert Rules CRUD + test (curador: dispara quando query retorna linhas)
		r.Get("/api/admin/alert-rules", adminhnd.ListAlertRulesHandler(db))
		r.Post("/api/admin/alert-rules/test", adminhnd.TestAlertRuleHandler(db))
		r.Post("/api/admin/alert-rules", adminhnd.CreateAlertRuleHandler(db))
		r.Put("/api/admin/alert-rules/{id}", adminhnd.UpdateAlertRuleHandler(db))
		r.Delete("/api/admin/alert-rules/{id}", adminhnd.DeleteAlertRuleHandler(db))

		danger := adminhnd.NewDangerHandler(db, st)
		r.Post("/api/admin/danger/soft-wipe", danger.SoftWipe)
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
