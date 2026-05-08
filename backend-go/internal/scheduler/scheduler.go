package scheduler

import (
	"context"
	"log/slog"
	"snatcher/backendv2/internal/clusters"
	"snatcher/backendv2/internal/llm"
	"snatcher/backendv2/internal/pipeline"
	"snatcher/backendv2/internal/store"
	"time"

	"github.com/go-co-op/gocron/v2"
)

type Scheduler struct {
	s        gocron.Scheduler
	runner   *pipeline.Runner
	tgPoller func(ctx context.Context)
	interval int
	llmCli   llm.Client
	storeRef store.Store
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

	// Job de dispatch worker — processa targets pendentes a cada 15s
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(15*time.Second),
			gocron.NewTask(func() { RunDispatchWorker(ctx, sc.storeRef) }),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	// Job de auto match — roda a cada 1 minuto quando habilitado
	if sc.storeRef != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(1*time.Minute),
			gocron.NewTask(func() { RunAutoMatchWorker(ctx, sc.storeRef) }),
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

	// Auto-curate LLM agora é gerido pelo Jonfrey (action auto_curate_high_confidence).
	// Ver internal/handlers/admin/jonfrey.go.

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
