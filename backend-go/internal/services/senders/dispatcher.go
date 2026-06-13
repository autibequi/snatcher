package senders

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"math/rand"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"

	"snatcher/backendv2/internal/services/sendwindow"
)

// DispatcherConfig — parâmetros do worker pool central.
// W1 do refactor V3. Substitui o modelo "1 goroutine por modem" (RunSender).
type DispatcherConfig struct {
	NumWorkers        int
	BaseInterval      time.Duration
	JitterPct         float64
	LeaseTTL          time.Duration
	HeartbeatInterval time.Duration
	ReclaimInterval   time.Duration
}

func DefaultDispatcherConfig() DispatcherConfig {
	return DispatcherConfig{
		NumWorkers:        8,
		BaseInterval:      90 * time.Second,
		JitterPct:         0.33,
		LeaseTTL:          DefaultLeaseTTL,
		HeartbeatInterval: DefaultHeartbeat,
		ReclaimInterval:   60 * time.Second,
	}
}

// RunDispatcher é o entrypoint do novo motor de envio.
// cmd/server/main.go chama uma única vez quando get_param('dispatch_engine','global',NULL) == 1.
func RunDispatcher(ctx context.Context, db *sqlx.DB, cfg DispatcherConfig) {
	slog.Info("dispatcher.start", "workers", cfg.NumWorkers, "base_interval_s", cfg.BaseInterval.Seconds())

	var wg sync.WaitGroup

	// Reclaim runner — devolve jobs órfãos pra pending.
	wg.Add(1)
	go func() {
		defer wg.Done()
		t := time.NewTicker(cfg.ReclaimInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				n, err := Reclaim(ctx, db, cfg.LeaseTTL)
				if err != nil {
					slog.Warn("dispatcher.reclaim_error", "err", err)
					continue
				}
				if n > 0 {
					slog.Warn("dispatcher.reclaimed_stale_jobs", "count", n)
				}
			}
		}
	}()

	// Worker pool.
	for i := 0; i < cfg.NumWorkers; i++ {
		wg.Add(1)
		workerID := fmt.Sprintf("worker-%d", i)
		go func(wid string) {
			defer wg.Done()
			runWorker(ctx, db, wid, cfg)
		}(workerID)
	}

	wg.Wait()
	slog.Info("dispatcher.shutdown")
}

func runWorker(ctx context.Context, db *sqlx.DB, workerID string, cfg DispatcherConfig) {
	slog.Info("dispatcher.worker.start", "worker", workerID)
	for {
		select {
		case <-ctx.Done():
			slog.Info("dispatcher.worker.stop", "worker", workerID)
			return
		default:
		}

		// gate: janela de envio (send_start_hour/send_end_hour) — paridade com o
		// sender legacy removido na W2. Fora da janela, não claima jobs.
		if !sendwindow.InSendWindow(ctx, db) {
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Minute):
			}
			continue
		}

		job, err := claimNextJob(ctx, db, workerID, cfg.LeaseTTL)
		if err != nil {
			slog.Warn("dispatcher.claim_error", "worker", workerID, "err", err)
			time.Sleep(5 * time.Second)
			continue
		}
		if job == nil {
			// Fila vazia — espera curta.
			time.Sleep(2 * time.Second)
			continue
		}

		processJob(ctx, db, job, workerID, cfg)

		// Cooldown com jitter para não cadenciar todos os workers ao mesmo tempo.
		sleep := cfg.BaseInterval + jitter(cfg.BaseInterval, cfg.JitterPct)
		select {
		case <-ctx.Done():
			return
		case <-time.After(sleep):
		}
	}
}

// jitter retorna um delta no intervalo [-pct*base, +pct*base].
func jitter(base time.Duration, pct float64) time.Duration {
	delta := float64(base) * pct
	return time.Duration((rand.Float64()*2 - 1) * delta)
}

// sendJob é a representação interna do row reclamado.
// sendJob representa uma row de send_queue claimada pelo dispatcher.
// RoutingKey armazena a chave de afinidade de domínio resolvida no momento do claim
// (gravada em send_queue.routing_key) para auditoria de divergência shadow vs. live.
type sendJob struct {
	ID         int64          `db:"id"`
	CatalogID  sql.NullInt64  `db:"catalog_id"`
	GroupID    int64          `db:"group_id"`
	AccountID  sql.NullInt64  `db:"account_id"`
	ModemID    int64          `db:"modem_id"`
	TemplateID sql.NullInt64  `db:"template_id"`
	DomainID   sql.NullInt64  `db:"domain_id"`
	Score           float64        `db:"score"`
	RoutingKey      sql.NullString `db:"routing_key"`
	MessageOverride sql.NullString `db:"message_override"`
}

// claimNextJob — FOR UPDATE SKIP LOCKED ORDER BY score DESC, scheduled_for ASC.
// Transação atômica: pega 1 row pending, marca sending com lease/worker_id, commita.
func claimNextJob(ctx context.Context, db *sqlx.DB, workerID string, ttl time.Duration) (*sendJob, error) {
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback() //nolint:errcheck

	var job sendJob
	err = tx.GetContext(ctx, &job, `
		SELECT id, catalog_id, group_id, account_id, modem_id, template_id, domain_id,
		       COALESCE(score, 0) AS score,
		       routing_key, message_override
		FROM send_queue
		WHERE status = 'pending'
		  AND (scheduled_for IS NULL OR scheduled_for <= now())
		ORDER BY COALESCE(score, 0) DESC, COALESCE(scheduled_for, created_at) ASC
		LIMIT 1
		FOR UPDATE SKIP LOCKED`)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	ttlInterval := fmt.Sprintf("%d seconds", int(ttl.Seconds()))
	_, err = tx.ExecContext(ctx, `
		UPDATE send_queue
		SET status = 'sending',
		    worker_id = $1,
		    lease_expires_at = now() + $2::interval,
		    heartbeat_at = now()
		WHERE id = $3`,
		workerID, ttlInterval, job.ID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &job, nil
}

// processJob delega à lógica existente em sender.go (sendViaEvolution / markFailed).
// Heartbeat goroutine estende lease enquanto envio ocorre.
func processJob(ctx context.Context, db *sqlx.DB, job *sendJob, workerID string, cfg DispatcherConfig) {
	hbDone := make(chan struct{})
	go func() {
		t := time.NewTicker(cfg.HeartbeatInterval)
		defer t.Stop()
		for {
			select {
			case <-hbDone:
				return
			case <-t.C:
				if err := Heartbeat(ctx, db, job.ID, workerID, cfg.LeaseTTL); err != nil {
					slog.Warn("dispatcher.heartbeat_error", "qid", job.ID, "err", err)
				}
			}
		}
	}()
	defer close(hbDone)

	var catalogID, accountID int64
	var templateID, domainID *int64
	if job.CatalogID.Valid {
		catalogID = job.CatalogID.Int64
	}
	if job.AccountID.Valid {
		accountID = job.AccountID.Int64
	}
	if job.TemplateID.Valid {
		t := job.TemplateID.Int64
		templateID = &t
	}
	if job.DomainID.Valid {
		d := job.DomainID.Int64
		domainID = &d
	}

	// Disparo manual (message_override presente, sem catalog_id): envia a mensagem pré-montada
	// via sendRawText. Sem este caminho o item caía em sendViaEvolution com catalog_id=0, não
	// achava produto e era marcado 'invalid' — a mensagem nunca chegava ao WhatsApp.
	if job.MessageOverride.Valid && job.MessageOverride.String != "" {
		if err := sendRawText(ctx, db, job.ModemID, job.GroupID, accountID, job.MessageOverride.String, ""); err != nil {
			slog.Warn("dispatcher.manual_send_failed", "qid", job.ID, "worker", workerID, "err", err)
			markFailed(ctx, db, job.ID, accountID, job.ModemID, err)
			return
		}
		markSent(ctx, db, job.ID, job.GroupID, nil, accountID, templateID, domainID)
		return
	}

	_, err := sendViaEvolution(ctx, db, job.ModemID, job.GroupID, catalogID, accountID, templateID, domainID)
	if err != nil {
		slog.Warn("dispatcher.send_failed", "qid", job.ID, "worker", workerID, "err", err)
		markFailed(ctx, db, job.ID, accountID, job.ModemID, err)
		return
	}
	// sendViaEvolution faz markSent internamente (preserva comportamento atual).
}
