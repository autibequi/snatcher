package senders

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunReaper libera locks abandonados em send_queue (status='sending' > 30min).
// Registrado no scheduler como cron */5 * * * *.
func RunReaper(ctx context.Context, db *sqlx.DB) error {
	res, err := db.ExecContext(ctx, `
		UPDATE send_queue
		SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END
		WHERE status='sending' AND enqueued_at < now() - INTERVAL '30 min'
	`)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n > 0 {
		slog.Warn("sender.reaper", "freed", n)
	}
	return nil
}
