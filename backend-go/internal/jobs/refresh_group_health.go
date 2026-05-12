package jobs

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RefreshGroupHealth recompõe mv_group_health. Cron 1h.
// Tenta REFRESH CONCURRENTLY primeiro (não bloqueia leituras); fallback para non-concurrent
// se a view não tiver índice único ainda (ex: primeira execução logo após migration).
func RefreshGroupHealth(ctx context.Context, db *sqlx.DB) error {
	_, err := db.ExecContext(ctx, "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_group_health")
	if err != nil {
		slog.Warn("refresh_group_health: concurrent failed, tentando non-concurrent", "err", err)
		if _, err2 := db.ExecContext(ctx, "REFRESH MATERIALIZED VIEW mv_group_health"); err2 != nil {
			slog.Warn("refresh_group_health: non-concurrent também falhou", "err", err2)
			return err2
		}
	}
	slog.Info("refresh_group_health: done")
	return nil
}
