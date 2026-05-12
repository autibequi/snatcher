package scheduler

import (
	"context"
	"log/slog"
	"snatcher/backendv2/internal/algo"
	"snatcher/backendv2/internal/clusters"
	"snatcher/backendv2/internal/curator"
	"snatcher/backendv2/internal/handlers/public/webhooks"
	"snatcher/backendv2/internal/jobs"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/loops"
	"snatcher/backendv2/internal/notifier"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/senders"
	"snatcher/backendv2/internal/store"
	"time"

	"github.com/go-co-op/gocron/v2"
	"github.com/jmoiron/sqlx"
)

type Scheduler struct {
	s        gocron.Scheduler
	runner   *pipeline.Runner
	tgPoller func(ctx context.Context)
	interval int
	llmCli   llm.Client
	storeRef store.Store
	db       *sqlx.DB                    // para cron jobs que acessam DB diretamente
	jonfreyTick func(ctx context.Context) // injetado via SetJonfreyTick — evita ciclo de import
	notif    *notifier.Notifier // pode ser nil — todas as chamadas tratam isso
}

// SetJonfreyTick registra o callback que executa todas as actions habilitadas do Jonfrey.
// Chamado pelo main.go após o handler do Jonfrey ser construído.
func (sc *Scheduler) SetJonfreyTick(fn func(ctx context.Context)) {
	sc.jonfreyTick = fn
}

// SetNotifier registra o notifier de eventos operacionais (relatórios, dispatches).
// Pode ser chamado depois do New(); workers checam nil internamente.
func (sc *Scheduler) SetNotifier(n *notifier.Notifier) {
	sc.notif = n
}

type Status struct {
	Running         bool      `json:"running"`
	IntervalMinutes int       `json:"interval_minutes"`
	NextRun         time.Time `json:"next_run"`
}

func New(intervalMinutes int, runner *pipeline.Runner, tgPoller func(ctx context.Context), st store.Store, llmCli llm.Client) (*Scheduler, error) {
	s, err := gocron.NewScheduler(gocron.WithStopTimeout(30 * time.Second))
	if err != nil {
		return nil, err
	}
	return &Scheduler{s: s, runner: runner, tgPoller: tgPoller, interval: intervalMinutes, storeRef: st, llmCli: llmCli}, nil
}

// SetDB injeta o sqlx.DB para cron jobs que precisam de acesso direto ao banco.
// Deve ser chamado antes de Start().
func (sc *Scheduler) SetDB(db *sqlx.DB) {
	sc.db = db
}

func (sc *Scheduler) Start(ctx context.Context) error {
	_, err := sc.s.NewJob(
		gocron.DurationJob(time.Duration(sc.interval)*time.Minute),
		gocron.NewTask(func() {
			slog.Info("scheduler: run pipeline")
			if err := sc.runner.Run(ctx); err != nil {
				slog.Error("scheduler: pipeline error", "err", err)
			}
		}),
		gocron.WithSingletonMode(gocron.LimitModeReschedule),
	)
	if err != nil {
		return err
	}

	if sc.tgPoller != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(30*time.Second),
			gocron.NewTask(func() { sc.tgPoller(ctx) }),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job de dispatch worker — processa targets pendentes a cada 15s.
	// Fase 4: quando use_send_queue=1, senders novos estão ativos → dispatch_worker antigo é no-op.
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(15*time.Second),
			gocron.NewTask(func() {
				// gate Fase 4: skip se senders v2 ativos
				if sc.db != nil {
					var flag float64
					if dbErr := sc.db.GetContext(ctx, &flag, "SELECT get_param('use_send_queue','global',NULL)"); dbErr == nil && flag >= 1 {
						slog.Debug("dispatch_worker: skipped — use_send_queue=1, senders v2 ativos")
						return
					}
				}
				_ = RunDispatchWorker(ctx, sc.storeRef, sc.notif)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Full-auto: pending_approval → queued sem depender do Jonfrey (tick separado).
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(1*time.Minute),
			gocron.NewTask(func() { RunPromotePendingApproval(ctx, sc.storeRef) }),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job de auto match — tick frequente; o intervalo real vem de appconfig (early return no worker).
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(15*time.Second),
			gocron.NewTask(func() { RunAutoMatchWorker(ctx, sc.storeRef, sc.notif) }),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Curadoria só por script (keywords + patterns), sem LLM — tick frequente; intervalo em appconfig.
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(30*time.Second),
			gocron.NewTask(func() { RunCurationHeuristicWorker(ctx, sc.storeRef, time.Now()) }),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Anúncios recorrentes (schedule_cron em tabela ads)
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(1*time.Minute),
			gocron.NewTask(func() { RunAdsWorker(ctx, sc.storeRef) }),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job semanal de clusters (segunda-feira 03:00 UTC)
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 3 * * 1", false),
			gocron.NewTask(func() {
				jobCtx := context.Background()
				if err := clusters.Compute(jobCtx, sc.storeRef, sc.llmCli); err != nil {
					slog.Error("clusters job failed", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job do Jonfrey — executa actions habilitadas a cada 1 min se enabled
	// Cada action checa internamente o JonfreyConfig.IntervalMinutes via last_run_at.
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(1*time.Minute),
			gocron.NewTask(func() {
				if sc.jonfreyTick == nil {
					slog.Warn("scheduler: jonfrey tick ignorado — SetJonfreyTick não registrou callback (handler nil)")
					return
				}
				cfg, err := sc.storeRef.GetJonfreyConfig()
				if err != nil {
					slog.Warn("scheduler: jonfrey tick ignorado — GetJonfreyConfig", "err", err)
					return
				}
				if !cfg.Enabled {
					slog.Debug("scheduler: jonfrey tick ignorado — Jonfrey desligado na config")
					return
				}
				// Respeita IntervalMinutes do JonfreyConfig
				if cfg.LastRunAt.Valid {
					interval := time.Duration(cfg.IntervalMinutes) * time.Minute
					if interval <= 0 {
						interval = 60 * time.Minute
					}
					since := time.Since(cfg.LastRunAt.Time)
					if since < interval {
						nextIn := (interval - since).Round(time.Second)
						slog.Info("scheduler: jonfrey tick aguardando intervalo",
							"interval", interval.String(),
							"last_run_at", cfg.LastRunAt.Time.UTC().Format(time.RFC3339),
							"elapsed", since.Round(time.Second).String(),
							"next_tick_in", nextIn.String(),
						)
						return
					}
				} else {
					slog.Info("scheduler: jonfrey tick — LastRunAt vazio, primeira execução ou reset")
				}
				slog.Info("scheduler: jonfrey tick disparando RunCycle",
					"source", "gocron_1m",
					"interval_minutes", cfg.IntervalMinutes,
					"enabled_actions_count", len(cfg.EnabledActions),
				)
				sc.jonfreyTick(ctx)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job de sync de grupos WA — atualiza member_count a cada 30min
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(30*time.Minute),
			gocron.NewTask(func() {
				slog.Info("scheduler: group sync started")
				RunGroupSyncWorker(ctx, sc.storeRef)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job diário de métricas — agrega sent/clicks/conversions/bans às 23:59
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("59 23 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: daily metrics job started")
				jobs.RunDailyMetricsJob(context.Background(), sc.db)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job diário de GC de group_sent_history — TTL 14d às 03:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 3 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: gc group_sent_history job started")
				jobs.RunGcGroupSentHistory(context.Background(), sc.db)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 2: Conversion tracking polling jobs

	// Amazon affiliate polling — hora cheia (cron 1h)
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 * * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: amazon conversions poll started")
				if err := webhooks.PollAmazonConversions(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: amazon poll error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Shopee affiliate polling — hora cheia (cron 1h)
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 * * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: shopee conversions poll started")
				if err := webhooks.PollShopeeConversions(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: shopee poll error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Refresh learned_weights — diário 02:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 2 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: refresh_learned_weights started")
				if err := jobs.RunRefreshLearnedWeights(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: refresh_learned_weights error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// GC clicks — TTL 90d, diário 03:30
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("30 3 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: gc_clicks started")
				_, gcErr := sc.db.ExecContext(context.Background(),
					`DELETE FROM clicks WHERE clicked_at < now() - INTERVAL '90 days'`)
				if gcErr != nil {
					slog.Error("scheduler: gc_clicks error", "err", gcErr)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 3: Algo tick — a cada 5min se use_algo_tick=1
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/5 * * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: algo.tick started")
				if err := algo.RunTick(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: algo.tick error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 3: Recompute quality scores — hora cheia
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 * * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: recompute_quality_scores started")
				if err := jobs.RunRecomputeQualityScores(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: recompute_quality_scores error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 3: Verify canonical URL — diario 04:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 4 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: verify_canonical_url started")
				if err := jobs.RunVerifyCanonicalURL(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: verify_canonical_url error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 3: TaxonomyGrow L5 — movido para Fase 5 com RunLoop wrapper (ver abaixo)

	// Fase 4: Reaper — libera send_queue travados a cada 5min
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/5 * * * *", false),
			gocron.NewTask(func() {
				slog.Debug("scheduler: sender.reaper started")
				if err := senders.RunReaper(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: sender.reaper error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 4: CGNAT check — verifica IP público dos modems a cada 5min
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/5 * * * *", false),
			gocron.NewTask(func() {
				slog.Debug("scheduler: cgnat_check started")
				if err := senders.RunCGNATCheck(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: cgnat_check error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 5: Refresh views materializadas dos loops — cron 5min
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/5 * * * *", false),
			gocron.NewTask(func() {
				slog.Debug("scheduler: refresh_mvs started")
				if err := jobs.RefreshMaterializedViews(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: refresh_mvs error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 5: Loops LLM — L5 TaxonomyGrow semanal domingo 03:00 (atualiza signature para RunMode)
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 3 * * 0", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: taxonomy_grow (loop) started")
				loops.RunLoop(context.Background(), sc.db, "taxonomy_grow", loops.RunTaxonomyGrow)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 5: L7 ScraperFix — diário 04:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 4 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: scraper_fix started")
				loops.RunLoop(context.Background(), sc.db, "scraper_fix", loops.RunScraperFix)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 5: L2 TemplateAB — sábado 03:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 3 * * 6", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: template_ab started")
				loops.RunLoop(context.Background(), sc.db, "template_ab", loops.RunTemplateAB)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 5: L6 AnomalyPause — cron 15min
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/15 * * * *", false),
			gocron.NewTask(func() {
				slog.Debug("scheduler: anomaly_pause started")
				loops.RunLoop(context.Background(), sc.db, "anomaly_pause", loops.RunAnomalyPause)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 5: L1 AffinityAdjust — mensal dia 1 04:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 4 1 * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: affinity_adjust started")
				loops.RunLoop(context.Background(), sc.db, "affinity_adjust", loops.RunAffinityAdjust)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 5: DecayStrikes — diário 01:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 1 * * *", false),
			gocron.NewTask(func() {
				slog.Debug("scheduler: decay_strikes started")
				if err := loops.DecayStrikes(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: decay_strikes error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 7: L4 CooldownSuggest — mensal dia 5 04:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 4 5 * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: cooldown_suggest started")
				loops.RunLoop(context.Background(), sc.db, "cooldown_suggest", loops.RunCooldownSuggest)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 7: L4 CapSuggest — mensal dia 5 04:30
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("30 4 5 * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: cap_suggest started")
				loops.RunLoop(context.Background(), sc.db, "cap_suggest", loops.RunCapSuggest)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 7: L8 AutoTuning — mensal dia 1 05:00
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 5 1 * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: auto_tuning started")
				loops.RunLoop(context.Background(), sc.db, "auto_tuning", loops.RunAutoTuning)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 7: L9 ContentOptimize — terça 04:00 (executa apenas se gate 60d atingido)
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 4 * * 2", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: content_optimize started")
				loops.RunLoop(context.Background(), sc.db, "content_optimize", loops.RunContentOptimize)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 6: Curator tick — coleta eventos e envia alertas WA a cada 5min
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/5 * * * *", false),
			gocron.NewTask(func() {
				slog.Debug("scheduler: curator_tick started")
				if err := curator.RunCuratorTick(context.Background(), sc.db, curator.GlobalSender); err != nil {
					slog.Error("scheduler: curator_tick error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 6: Daily report — relatório diário 08h SP (11h UTC)
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 11 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: curator daily_report started")
				if err := curator.RunDailyReport(context.Background(), sc.db, curator.GlobalSender); err != nil {
					slog.Error("scheduler: curator daily_report error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 6: Confirmer GC — limpa confirmações expiradas a cada minuto
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("* * * * *", false),
			gocron.NewTask(func() {
				curator.GlobalConfirmer.Gc(context.Background())
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 8: CacheImages — baixa imagens de catalog a cada 30min
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/30 * * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: cache_images started")
				if err := jobs.RunCacheImages(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: cache_images error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 8: RefreshGroupHealth — recompõe mv_group_health a cada hora
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 * * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: refresh_group_health started")
				if err := jobs.RefreshGroupHealth(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: refresh_group_health error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Fase 8: SentimentAnalyze — stub diário 05:00 (no-op por ora)
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 5 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: sentiment_analyze started")
				if err := jobs.RunSentimentAnalyze(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: sentiment_analyze error", "err", err)
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	sc.s.Start()
	return nil
}

func (sc *Scheduler) Stop() {
	_ = sc.s.Shutdown()
}

func (sc *Scheduler) Status() Status {
	jobs := sc.s.Jobs()
	var nextRun time.Time
	if len(jobs) > 0 {
		nextRun, _ = jobs[0].NextRun()
	}
	return Status{
		Running:         len(jobs) > 0,
		IntervalMinutes: sc.interval,
		NextRun:         nextRun,
	}
}
