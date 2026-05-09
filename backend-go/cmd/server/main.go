// @title           Snatcher API
// @version         1.0
// @description     API de scraping e monitoramento de preços com integração Telegram/WhatsApp.
// @host            localhost:8000
// @BasePath        /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization

package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"snatcher/backendv2/internal/adapters"
	"snatcher/backendv2/internal/config"
	appdb "snatcher/backendv2/internal/db"
	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/observability"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/redirect"
	"snatcher/backendv2/internal/router"
	"snatcher/backendv2/internal/scheduler"
	"snatcher/backendv2/internal/scrapers"
	"snatcher/backendv2/internal/store"
)

func main() {
	// Set up JSON structured logger before any other action so all subsequent
	// log calls (including from imported packages) use the correct handler.
	slog.SetDefault(observability.NewLogger(os.Getenv("LOG_LEVEL"), os.Getenv("ENV")))

	// Register all Prometheus metrics with the default registry.
	observability.MustRegisterAll()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config validation failed", "err", err)
		os.Exit(1)
	}

	if cfg.GOMAXPROCS > 0 {
		runtime.GOMAXPROCS(cfg.GOMAXPROCS)
	}

	// DB
	db, err := appdb.Open(cfg.DatabaseURL)
	if err != nil {
		slog.Error("open db", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		slog.Error("migrations", "err", err)
		os.Exit(1)
	}

	// Store
	st := store.New(db)

	// Pré-configura AppConfig com variáveis de ambiente se ainda não configurado
	bootstrapConfig(st)

	// Redirect (prewarm antes de aceitar tráfego)
	rd := redirect.New(db, st)
	rd.Prewarm()

	// Scrapers
	appCfg, _ := st.GetConfig()
	mlScraper := scrapers.NewMLScraper(
		appCfg.MLClientID.String,
		appCfg.MLClientSecret.String,
	)
	amzScraper := scrapers.NewAmazonScraper()

	scraperMap := map[string]pipeline.Scraper{
		"ml":  mlScraper,
		"amz": amzScraper,
	}

	// Adapters de mensagem
	adapterMap := pipeline.AdapterRegistry{}

	// WhatsApp (Evolution)
	if appCfg.WABaseURL.Valid && appCfg.WAApiKey.Valid && appCfg.WAInstance.Valid {
		evo := adapters.NewEvolution(
			appCfg.WABaseURL.String,
			appCfg.WAApiKey.String,
			appCfg.WAInstance.String,
		)
		adapterMap["whatsapp"] = evo
	}

	// Telegram
	if appCfg.TGEnabled && appCfg.TGBotToken.Valid {
		tg, err := adapters.NewTelegram(appCfg.TGBotToken.String)
		if err != nil {
			slog.Warn("telegram init failed", "err", err)
		} else {
			adapterMap["telegram"] = tg
		}
	}

	// Pipeline runner
	runner := pipeline.NewRunner(st, scraperMap, adapterMap)

	// Scheduler
	sched, err := scheduler.New(cfg.ScanInterval, runner, nil, st, nil)
	if err != nil {
		slog.Error("scheduler init", "err", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := sched.Start(ctx); err != nil {
		slog.Error("scheduler start", "err", err)
		os.Exit(1)
	}
	defer sched.Stop()

	// HTTP server
	h := router.Build(db, st, rd, runner, sched, scraperMap, adapterMap, cfg.JWTSecret)
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: h,
		// Alinhar com chimw.Timeout(5m): WriteTimeout menor cortava responses enquanto o handler
		// ainda esperava OpenRouter (/api longos, compose, jonfrey).
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 320 * time.Second, // um pouco acima do timeout Chi para flush da resposta
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("backendv2 starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down...")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutCancel()
	_ = srv.Shutdown(shutCtx)
}

// bootstrapConfig preenche o AppConfig com variáveis de ambiente
// APENAS se os campos ainda estiverem vazios (não sobrescreve config manual).
func bootstrapConfig(st store.Store) {
	cfg, err := st.GetConfig()
	if err != nil {
		return
	}

	changed := false

	evoURL := os.Getenv("EVOLUTION_URL")
	if evoURL == "" {
		evoURL = "http://snatcher-evolution:8080"
	}
	if !cfg.WABaseURL.Valid || cfg.WABaseURL.String == "" {
		cfg.WABaseURL = models.NullString{NullString: sql.NullString{String: evoURL, Valid: true}}
		changed = true
	}

	if apiKey := os.Getenv("EVOLUTION_API_KEY"); apiKey != "" && (!cfg.WAApiKey.Valid || cfg.WAApiKey.String == "") {
		cfg.WAApiKey = models.NullString{NullString: sql.NullString{String: apiKey, Valid: true}}
		changed = true
	}

	instance := os.Getenv("EVOLUTION_INSTANCE")
	if instance == "" {
		instance = "default"
	}
	if !cfg.WAInstance.Valid || cfg.WAInstance.String == "" {
		cfg.WAInstance = models.NullString{NullString: sql.NullString{String: instance, Valid: true}}
		changed = true
	}

	if changed {
		_ = st.UpdateConfig(cfg)
		slog.Info("bootstrapConfig: AppConfig pré-configurado com variáveis de ambiente")
	}
}
