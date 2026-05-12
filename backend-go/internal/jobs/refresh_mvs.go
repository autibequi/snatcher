package jobs

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RefreshMaterializedViews recompõe as 3 views materializadas dos loops.
// Cron 5min. Usa CONCURRENTLY quando possível.
func RefreshMaterializedViews(ctx context.Context, db *sqlx.DB) error {
	views := []string{"mv_anomaly_signals", "mv_scraper_health", "mv_group_decay"}
	for _, v := range views {
		if _, err := db.ExecContext(ctx, "REFRESH MATERIALIZED VIEW CONCURRENTLY "+v); err != nil {
			// fallback sem CONCURRENTLY (1ª vez — índice único ainda não populado)
			if _, err2 := db.ExecContext(ctx, "REFRESH MATERIALIZED VIEW "+v); err2 != nil {
				slog.Warn("refresh_mv", "view", v, "err", err2)
				continue
			}
		}
	}
	return nil
}
