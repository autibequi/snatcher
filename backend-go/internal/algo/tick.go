package algo

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunTick executa 1 ciclo do Algo cimentado (5 camadas). Cron 5min.
// Gated por tunable_parameter 'use_algo_tick' = 1.
func RunTick(ctx context.Context, db *sqlx.DB) error {
	// 0. Gate: flag use_algo_tick
	var flag float64
	if err := db.GetContext(ctx, &flag, "SELECT get_param('use_algo_tick','global',NULL)"); err != nil || flag == 0 {
		return nil // tick desligado
	}

	// 1. Janela 21h-6h SP
	if !InSendWindow() {
		return nil
	}

	// 2. Advisory lock (singleton — evita overlap de ticks concorrentes)
	var locked bool
	if err := db.GetContext(ctx, &locked, "SELECT pg_try_advisory_xact_lock(8442)"); err != nil || !locked {
		slog.Debug("algo.tick: another instance running, skip")
		return nil
	}

	// 3. Para cada grupo ativo, selecionar top-1 item via SQL com hard skips
	type group struct {
		ID          int64  `db:"id"`
		CategoryID  *int64 `db:"category_id"`
		DailyMsgCap int    `db:"daily_msg_cap"`
		Timezone    string `db:"timezone"`
	}
	var groups []group
	if err := db.SelectContext(ctx, &groups, `
		SELECT id, category_id, daily_msg_cap, timezone
		FROM groups
		WHERE COALESCE(enabled, true) = true
	`); err != nil {
		return err
	}

	enqueued := 0
	for _, g := range groups {
		if !ShouldEnqueueGroup(ctx, db, g.ID, g.DailyMsgCap) {
			continue
		}
		item, score, ok := selectTopForGroup(ctx, db, g.ID, g.CategoryID)
		if !ok {
			continue
		}
		if err := enqueueSend(ctx, db, g.ID, item, score); err != nil {
			slog.Warn("algo.tick: enqueue", "err", err, "group", g.ID)
			continue
		}
		enqueued++
	}
	slog.Info("algo.tick: done", "enqueued", enqueued, "groups", len(groups))
	return nil
}
