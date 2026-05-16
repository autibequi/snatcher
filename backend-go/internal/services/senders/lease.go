package senders

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
)

const (
	DefaultLeaseTTL   = 90 * time.Second
	DefaultHeartbeat  = 30 * time.Second
	ReclaimMultiplier = 2 // job reclaimed se heartbeat_at < now() - 2*TTL
)

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

// Heartbeat estende lease.
func Heartbeat(ctx context.Context, db *sqlx.DB, jobID int64, workerID string, ttl time.Duration) error {
	_, err := db.ExecContext(ctx, `
        UPDATE send_queue
        SET heartbeat_at=now(), lease_expires_at=now() + $1::interval
        WHERE id=$2 AND worker_id=$3 AND status='sending'`,
		ttl.String(), jobID, workerID)
	return err
}

// Reclaim devolve jobs com heartbeat parado a 2×TTL pra pending.
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
