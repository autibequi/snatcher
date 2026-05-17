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
	"snatcher/backendv2/internal/services/algo"
	"snatcher/backendv2/internal/services/canonical"
	"snatcher/backendv2/internal/services/curator"
	"snatcher/backendv2/internal/services/jobs"
	"snatcher/backendv2/internal/services/llm"
	"snatcher/backendv2/internal/services/loops"
	"snatcher/backendv2/internal/services/notifier"
	"snatcher/backendv2/internal/services/pipeline"
	"snatcher/backendv2/internal/services/senders"
	"snatcher/backendv2/internal/services/spy"

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
	jonfreyTick func(ctx context.Context, ids []string) // injetado via SetJonfreyTick — evita ciclo de import
	catalogLLMFactory func() llm.Client            // opcional: drena catalog_llm_queue (SetCatalogLLMProcessor)
	notif    *notifier.Notifier // pode ser nil — todas as chamadas tratam isso
}

// SetJonfreyTick registra o callback que executa actions do Jonfrey.
// ids: lista de action-IDs vindos do banco (habilitados e com intervalo vencido).
// Lista vazia = fallback para cfg.EnabledActions em RunCycle.
// Chamado pelo router após o handler do Jonfrey ser construído.
func (sc *Scheduler) SetJonfreyTick(fn func(ctx context.Context, ids []string)) {
	sc.jonfreyTick = fn
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

// scheduledAutomation representa uma automação habilitada no banco com seu intervalo.
// Usado pelo tick do Jonfrey para decidir quais actions executar por ciclo.
type scheduledAutomation struct {
	ID              string  `db:"id"`
	IntervalMinutes *int    `db:"interval_minutes"`
	LastRunAt       *string `db:"last_run_at"`
}

// fetchEnabledAutomations busca as automações habilitadas do banco.
// Retorna slice de scheduledAutomation para o tick decidir quais rodar.
// Se a consulta falhar (ex: tabela ainda não existe), retorna slice vazio e log.
func fetchEnabledAutomations(ctx context.Context, db *sqlx.DB) ([]scheduledAutomation, error) {
	var rows []scheduledAutomation
	err := db.SelectContext(ctx, &rows, `
		SELECT id, interval_minutes, last_run_at::text AS last_run_at
		FROM automations
		WHERE enabled = TRUE
		ORDER BY id
	`)
	return rows, err
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

	// Job do Jonfrey — executa actions habilitadas a cada 1 min.
	// Lê a tabela `automations` e verifica por action se seu interval_minutes venceu.
	// Fallback para cfg.EnabledActions quando a tabela está vazia ou inacessível.
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

				// Tentativa de leitura DB-driven: busca automations habilitadas com seus intervalos.
				// fetchEnabledAutomations deve ser chamado ANTES de qualquer mutex.
				var dueIDs []string
				if sc.db != nil {
					dbCtx := context.Background()
					automations, fetchErr := fetchEnabledAutomations(dbCtx, sc.db)
					if fetchErr != nil {
						slog.Warn("scheduler: jonfrey tick — fetchEnabledAutomations falhou, usando cfg fallback",
							"err", fetchErr)
					} else if len(automations) > 0 {
						// Checa por automation qual teve seu interval_minutes vencido.
						now := time.Now()
						for _, a := range automations {
							intervalMin := 60 // default 60min se não configurado
							if a.IntervalMinutes != nil && *a.IntervalMinutes > 0 {
								intervalMin = *a.IntervalMinutes
							}
							interval := time.Duration(intervalMin) * time.Minute
							if a.LastRunAt == nil || *a.LastRunAt == "" {
								// Nunca rodou — é candidata imediata.
								dueIDs = append(dueIDs, a.ID)
								continue
							}
							// Parseia last_run_at (formato RFC3339 ou timestamp sem timezone).
							var lastRun time.Time
							if t, parseErr := time.Parse(time.RFC3339, *a.LastRunAt); parseErr == nil {
								lastRun = t
							} else if t, parseErr := time.Parse("2006-01-02T15:04:05", *a.LastRunAt); parseErr == nil {
								lastRun = t
							} else {
								// Formato desconhecido — assume candidata.
								dueIDs = append(dueIDs, a.ID)
								continue
							}
							if now.Sub(lastRun) >= interval {
								dueIDs = append(dueIDs, a.ID)
							}
						}
						slog.Info("scheduler: jonfrey tick DB-driven",
							"automations_enabled", len(automations),
							"automations_due", len(dueIDs),
						)
						if len(dueIDs) == 0 {
							slog.Debug("scheduler: jonfrey tick — nenhuma automation com intervalo vencido")
							return
						}
						sc.jonfreyTick(ctx, dueIDs)
						return
					}
					// DB retornou vazio — fallback para cfg.
					slog.Debug("scheduler: jonfrey tick — tabela automations vazia, usando cfg fallback")
				}

				// Fallback: comportamento original com intervalo global cfg.IntervalMinutes.
				if cfg.LastRunAt.Valid {
					interval := time.Duration(cfg.IntervalMinutes) * time.Minute
					if interval <= 0 {
						interval = 60 * time.Minute
					}
					since := time.Since(cfg.LastRunAt.Time)
					if since < interval {
						nextIn := (interval - since).Round(time.Second)
						slog.Info("scheduler: jonfrey tick aguardando intervalo (cfg fallback)",
							"interval", interval.String(),
							"last_run_at", cfg.LastRunAt.Time.UTC().Format(time.RFC3339),
							"elapsed", since.Round(time.Second).String(),
							"next_tick_in", nextIn.String(),
						)
						return
					}
				} else {
					slog.Info("scheduler: jonfrey tick — LastRunAt vazio, primeira execução ou reset (cfg fallback)")
				}
				slog.Info("scheduler: jonfrey tick disparando RunCycle (cfg fallback)",
					"source", "gocron_1m",
					"interval_minutes", cfg.IntervalMinutes,
					"enabled_actions_count", len(cfg.EnabledActions),
				)
				sc.jonfreyTick(ctx, nil) // nil = fallback para cfg.EnabledActions em RunCycle
			}),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
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

	// Refresh learned_weights — a cada hora (no minuto 7 pra não competir com
	// outros jobs do topo da hora). Antes era diário às 02h; trazido para horário
	// pra fechar o loop click → scoring em ~1h de latência em vez de ~24h.
	if sc.db != nil {
		_, err = sc.s.NewJob(
			gocron.CronJob("7 * * * *", false),
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

	// Fase 3: Algo tick — a cada 5min (incondicional)
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

	// sub6: Spy polling — coleta mensagens de grupos espionados a cada 10min.
	// Com MESSAGING_MOCK=true usa mock gateway para fechar o pipeline end-to-end.
	// Gateway real (Baileys/gramjs sidecar) aguarda ADR-009.
	if sc.storeRef != nil {
		// Parser sem LLM client — regex path é suficiente para triagem inicial.
		spyParser := spy.NewParser(nil)
		spyJob := jobs.NewSpyPollingJob(sc.storeRef, spyParser)

		_, err = sc.s.NewJob(
			gocron.CronJob("*/10 * * * *", false),
			gocron.NewTask(func() {
				slog.Debug("scheduler: spy.polling started")
				if runErr := spyJob.Run(context.Background()); runErr != nil {
					slog.Error("scheduler: spy.polling error", "err", runErr)
				}
			}),
			gocron.WithName("spy.polling"),
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
