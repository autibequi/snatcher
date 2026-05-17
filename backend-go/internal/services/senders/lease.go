package senders

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

const (
	DefaultLeaseTTL   = 90 * time.Second
	DefaultHeartbeat  = 30 * time.Second
	ReclaimMultiplier = 2 // job reclaimed se heartbeat_at < now() - 2*TTL
)

// ─── Funções legadas (usadas pelo dispatcher.go) ─────────────────────────────

// Lease tenta claim de um job pra workerID; retorna true se OK.
func Lease(ctx context.Context, db *sqlx.DB, jobID int64, workerID string, ttl time.Duration) (bool, error) {
	res, err := db.ExecContext(ctx, `
        UPDATE send_queue
        SET status='sending', worker_id=$1, lease_expires_at=now() + $2::interval, heartbeat_at=now()
        WHERE id=$3 AND (status='pending' OR (status='sending' AND lease_expires_at < now()))`,
		workerID, ttl.String(), jobID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// Heartbeat estende lease para um job específico (usado pelo dispatcher.go).
func Heartbeat(ctx context.Context, db *sqlx.DB, jobID int64, workerID string, ttl time.Duration) error {
	_, err := db.ExecContext(ctx, `
        UPDATE send_queue
        SET heartbeat_at=now(), lease_expires_at=now() + $1::interval
        WHERE id=$2 AND worker_id=$3 AND status='sending'`,
		ttl.String(), jobID, workerID)
	return err
}

// Reclaim devolve jobs com heartbeat parado a 2×TTL pra pending (usado pelo dispatcher.go).
func Reclaim(ctx context.Context, db *sqlx.DB, ttl time.Duration) (int64, error) {
	res, err := db.ExecContext(ctx, `
        UPDATE send_queue
        SET status='pending', worker_id=NULL, lease_expires_at=NULL, heartbeat_at=NULL
        WHERE status='sending' AND heartbeat_at < now() - ($1::interval * 2)`,
		ttl.String())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ─── Batch lease API (W1 card4) ──────────────────────────────────────────────

// AcquireLease adquire lease em batch usando FOR UPDATE SKIP LOCKED.
// Retorna os IDs dos jobs adquiridos (até batchSize).
// Cada etapa de execução é delegada a uma função com responsabilidade única.
func AcquireLease(ctx context.Context, db *sqlx.DB, workerID string, batchSize int) ([]int64, error) {
	query := buildAcquireQuery(batchSize)
	rows, err := executeAcquire(ctx, db, query, workerID)
	if err != nil {
		return nil, fmt.Errorf("lease.AcquireLease: %w", err)
	}
	defer rows.Close()

	jobIDs, err := parseAcquiredIDs(rows)
	if err != nil {
		return nil, fmt.Errorf("lease.AcquireLease.parse: %w", err)
	}
	return jobIDs, nil
}

// buildAcquireQuery constrói a query CTE que seleciona e marca jobs em batch.
// Usa FOR UPDATE SKIP LOCKED para garantir exclusão mútua sem bloqueio.
func buildAcquireQuery(batchSize int) string {
	return fmt.Sprintf(`
		WITH candidates AS (
			SELECT id
			FROM send_queue
			WHERE status = 'pending'
			  AND (scheduled_for IS NULL OR scheduled_for <= now())
			ORDER BY COALESCE(score, 0) DESC, COALESCE(scheduled_for, enqueued_at) ASC
			LIMIT %d
			FOR UPDATE SKIP LOCKED
		)
		UPDATE send_queue
		SET status        = 'sending',
		    worker_id     = $1,
		    lease_expires_at = now() + ($2::int * interval '1 second'),
		    heartbeat_at  = now()
		FROM candidates
		WHERE send_queue.id = candidates.id
		RETURNING send_queue.id
	`, batchSize)
}

// executeAcquire executa a query de acquire e devolve as rows resultantes.
func executeAcquire(ctx context.Context, db *sqlx.DB, query string, workerID string) (*sqlx.Rows, error) {
	ttlSeconds := int(DefaultLeaseTTL.Seconds())
	return db.QueryxContext(ctx, query, workerID, ttlSeconds)
}

// parseAcquiredIDs lê as rows retornadas e extrai os IDs adquiridos.
func parseAcquiredIDs(rows *sqlx.Rows) ([]int64, error) {
	var jobIDs []int64
	for rows.Next() {
		var jobID int64
		if err := rows.Scan(&jobID); err != nil {
			return nil, err
		}
		jobIDs = append(jobIDs, jobID)
	}
	return jobIDs, rows.Err()
}

// RenewLease renova a lease de múltiplos jobs em batch (heartbeat coletivo).
// Só renova jobs cujo worker_id bate com workerID para evitar corrida de dados.
func RenewLease(ctx context.Context, db *sqlx.DB, workerID string, jobIDs []int64) error {
	if len(jobIDs) == 0 {
		return nil
	}
	ttlSeconds := int(DefaultLeaseTTL.Seconds())
	_, err := db.ExecContext(ctx, `
		UPDATE send_queue
		SET heartbeat_at    = now(),
		    lease_expires_at = now() + ($1::int * interval '1 second')
		WHERE worker_id = $2
		  AND id        = ANY($3)
		  AND status    = 'sending'
	`, ttlSeconds, workerID, pq.Array(jobIDs))
	if err != nil {
		return fmt.Errorf("lease.RenewLease: %w", err)
	}
	return nil
}

// ReleaseLease libera a lease de múltiplos jobs, devolvendo-os ao status pending.
// Usado no encerramento gracioso de um worker ou após falha irrecuperável.
func ReleaseLease(ctx context.Context, db *sqlx.DB, workerID string, jobIDs []int64) error {
	if len(jobIDs) == 0 {
		return nil
	}
	_, err := db.ExecContext(ctx, `
		UPDATE send_queue
		SET status          = 'pending',
		    worker_id       = NULL,
		    lease_expires_at = NULL,
		    heartbeat_at    = NULL
		WHERE worker_id = $1
		  AND id        = ANY($2)
		  AND status    = 'sending'
	`, workerID, pq.Array(jobIDs))
	if err != nil {
		return fmt.Errorf("lease.ReleaseLease: %w", err)
	}
	return nil
}

// StartHeartbeatLoop inicia uma goroutine que renova a lease de jobIDs a cada
// HeartbeatInterval até que ctx seja cancelado. Não entra em pânico em falhas —
// loga warning e continua para garantir best-effort em caso de falha transitória de rede.
func StartHeartbeatLoop(ctx context.Context, db *sqlx.DB, workerID string, jobIDs []int64) {
	if len(jobIDs) == 0 {
		return
	}

	go func() {
		ticker := time.NewTicker(DefaultHeartbeat)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				// Worker encerrado — para o loop de heartbeat.
				return
			case <-ticker.C:
				if err := RenewLease(ctx, db, workerID, jobIDs); err != nil {
					slog.Warn("lease.heartbeat_loop.renew_failed",
						"worker", workerID,
						"jobs", len(jobIDs),
						"err", err,
					)
				}
			}
		}
	}()
}

// ReclaimStaleLease devolve jobs com lease expirada para status pending.
// Deve ser chamado periodicamente pelo dispatcher (ex: a cada minuto).
// Retorna a contagem de jobs recuperados.
func ReclaimStaleLease(ctx context.Context, db *sqlx.DB) (int, error) {
	res, err := db.ExecContext(ctx, `
		UPDATE send_queue
		SET status          = 'pending',
		    worker_id       = NULL,
		    lease_expires_at = NULL,
		    heartbeat_at    = NULL
		WHERE status IN ('pending', 'sending')
		  AND lease_expires_at IS NOT NULL
		  AND lease_expires_at < now()
	`)
	if err != nil {
		return 0, fmt.Errorf("lease.ReclaimStaleLease: %w", err)
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}
