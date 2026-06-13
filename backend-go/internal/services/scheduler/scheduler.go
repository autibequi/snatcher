package scheduler

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"time"

	"snatcher/backendv2/internal/handlers/public/webhooks"
	"snatcher/backendv2/internal/observability"
	store "snatcher/backendv2/internal/repositories"
	"snatcher/backendv2/internal/services/canonical"
	"snatcher/backendv2/internal/services/jobs"
	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/services/notifier"
	"snatcher/backendv2/internal/services/pipeline"
	"snatcher/backendv2/internal/services/selection"
	"snatcher/backendv2/internal/services/senders"

	"github.com/go-co-op/gocron/v2"
	"github.com/jmoiron/sqlx"
)

type Scheduler struct {
	s        gocron.Scheduler
	runner   *pipeline.Runner
	interval int
	llmCli   llm.Client
	storeRef store.Store
	db       *sqlx.DB                              // para cron jobs que acessam DB diretamente
	catalogLLMFactory func() llm.Client            // opcional: drena catalog_llm_queue (SetCatalogLLMProcessor)
	notif    *notifier.Notifier // pode ser nil — todas as chamadas tratam isso
}

// SetCatalogLLMProcessor registra a factory LLM para o worker da fila catalog_llm_queue (opcional).
func (sc *Scheduler) SetCatalogLLMProcessor(fn func() llm.Client) {
	sc.catalogLLMFactory = fn
}

// SetNotifier registra o notifier para extensões futuras (o scheduler não
// envia alertas de dispatch por aqui).
// Pode ser chamado depois do New(); workers checam nil internamente.
func (sc *Scheduler) SetNotifier(n *notifier.Notifier) {
	sc.notif = n
}

type Status struct {
	Running         bool      `json:"running"`
	IntervalMinutes int       `json:"interval_minutes"`
	NextRun         time.Time `json:"next_run"`
}

func New(intervalMinutes int, runner *pipeline.Runner, st store.Store, llmCli llm.Client) (*Scheduler, error) {
	s, err := gocron.NewScheduler(gocron.WithStopTimeout(30 * time.Second))
	if err != nil {
		return nil, err
	}
	return &Scheduler{s: s, runner: runner, interval: intervalMinutes, storeRef: st, llmCli: llmCli}, nil
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

	// Worker catalog_llm_queue — até 5 itens a cada 2 min (eurística + LLM se necessário)
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/2 * * * *", false),
			gocron.NewTask(func() {
				if sc.catalogLLMFactory == nil {
					return
				}
				var pending int
				if err := sc.db.GetContext(context.Background(), &pending,
					`SELECT COUNT(*) FROM catalog_llm_queue WHERE status = 'pending'`); err != nil || pending == 0 {
					return
				}
				runCtx := context.Background()
				for i := 0; i < 5; i++ {
					out, err := jobs.RunCatalogLLMQueueOnce(runCtx, sc.db, sc.catalogLLMFactory)
					if err != nil {
						slog.Error("scheduler: catalog_llm_queue", "err", err)
						break
					}
					proc, _ := out["processed"].(bool)
					if !proc {
						break
					}
				}
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job de sync de grupos WA — atualiza member_count e auto-associa contas a cada 30min.
	// Roda também imediatamente no startup para popular member_count logo após boot.
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(30*time.Minute),
			gocron.NewTask(func() {
				slog.Info("scheduler: group sync started")
				RunGroupSyncWorker(ctx, sc.storeRef, sc.db)
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
			gocron.WithStartAt(gocron.WithStartImmediately()),
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

	// Job diário de reset de budget LLM — zera daily_spent_usd à meia-noite UTC (00:00).
	// Usa BudgetGuard.ResetAll() que atualiza também last_reset_at.
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 0 * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: llm.budget.daily_reset started")
				budgetGuard := llm.NewBudgetGuard(sc.db)
				if resetErr := budgetGuard.ResetAll(context.Background()); resetErr != nil {
					slog.Error("scheduler: llm.budget.daily_reset error", "err", resetErr)
					return
				}
				slog.Info("scheduler: llm.budget.daily_reset completed — daily_spent_usd zerado")
			}),
			gocron.WithName("llm.budget.daily_reset"),
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

	// Seleção determinística — enfileira o melhor produto por grupo a cada 5min.
	// Substitui o algo.tick (bandit) removido na W1. Advisory lock interno (multi-réplica).
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/5 * * * *", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: selection.tick started")
				if err := selection.RunSelectionTick(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: selection.tick error", "err", err)
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

	// W2.C: Canonical backfill — popula canonical_product_id em catalog rows sem vínculo, diário 04:15.
	// batchSize configurável via CANONICAL_BACKFILL_BATCH_SIZE (default 500).
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("15 4 * * *", false),
			gocron.NewTask(func() {
				batchSize := 500
				if raw := os.Getenv("CANONICAL_BACKFILL_BATCH_SIZE"); raw != "" {
					if parsed, parseErr := strconv.Atoi(raw); parseErr == nil && parsed > 0 {
						batchSize = parsed
					}
				}
				slog.Info("scheduler: canonical.backfill started", "batch_size", batchSize)
				stats, err := canonical.RunBackfill(context.Background(), sc.db, batchSize)
				if err != nil {
					slog.Error("scheduler: canonical.backfill error", "err", err)
				} else {
					slog.Info("scheduler: canonical.backfill done",
						"processed", stats.Processed,
						"reused", stats.Reused,
						"inserted", stats.Inserted,
						"low_confidence", stats.LowConfidence,
						"dedup_rate_pct", stats.DeduRatePct,
					)
				}
			}),
			gocron.WithName("canonical.backfill"),
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

	// ADR-014 mitigação W-1: atualiza gauge llm_classification_pending_review a cada 5min
	// enquanto o loop de correção completo (W3+W5) não está disponível.
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("*/5 * * * *", false),
			gocron.NewTask(func() {
				observability.UpdateLLMPendingReview(context.Background(), sc.db)
			}),
			gocron.WithName("observability.llm_pending_review"),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// sub6-c3: Cluster compute — KMeans sobre canais ativos, semanal domingo 02:00.
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("0 2 * * 0", false),
			gocron.NewTask(func() {
				slog.Info("scheduler: compute_clusters started")
				if err := jobs.RunComputeClusters(context.Background(), sc.db); err != nil {
					slog.Error("scheduler: compute_clusters error", "err", err)
				}
			}),
			gocron.WithName("compute_clusters"),
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
