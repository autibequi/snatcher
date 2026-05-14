package algo

import (
	"context"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
)

// RunTick executa 1 ciclo do Algo cimentado (5 camadas). Cron 5min.
// Gated por tunable_parameter 'use_algo_tick' = 1.
func RunTick(ctx context.Context, db *sqlx.DB) error {
	started := time.Now()

	// 0. Gate: flag use_algo_tick
	var flag float64
	if err := db.GetContext(ctx, &flag, "SELECT get_param('use_algo_tick','global',NULL)"); err != nil || flag == 0 {
		return nil // tick desligado — não registra em algo_status (status é derivado da flag)
	}

	// 1. Janela 21h-6h SP
	if !InSendWindow() {
		return nil // pausado — não registra (frontend detecta pela janela)
	}

	// 2. Advisory lock (singleton — evita overlap de ticks concorrentes)
	var locked bool
	if err := db.GetContext(ctx, &locked, "SELECT pg_try_advisory_xact_lock(8442)"); err != nil || !locked {
		slog.Debug("algo.tick: another instance running, skip")
		return nil
	}

	// 3. Para cada grupo ativo, seleciona top-K via fórmula composta + MMR
	type group struct {
		ID          int64  `db:"id"`
		ChannelID   int64  `db:"channel_id"`
		CategoryID  *int64 `db:"category_id"`
		DailyMsgCap int    `db:"daily_msg_cap"`
		Timezone    string `db:"timezone"`
	}
	var groups []group
	if err := db.SelectContext(ctx, &groups, `
		SELECT id, channel_id, category_id, daily_msg_cap, timezone
		FROM groups
		WHERE COALESCE(status, 'active') = 'active'
	`); err != nil {
		return err
	}

	lambda := loadMMRLambda(ctx, db)
	thompsonOn := thompsonEnabled(ctx, db)
	if thompsonOn {
		if err := updateBanditArms(ctx, db); err != nil {
			slog.Warn("algo.tick: updateBanditArms", "err", err)
		}
		if err := updateBanditArmsChannel(ctx, db); err != nil {
			slog.Warn("algo.tick: updateBanditArmsChannel", "err", err)
		}
	}

	enqueued := 0
	for _, g := range groups {
		if !ShouldEnqueueGroup(ctx, db, g.ID, g.DailyMsgCap) {
			continue
		}
		// Categoria efetiva: se Thompson ativo, amostra do bandit;
		// senão usa a categoria fixa do grupo (g.CategoryID, pode ser nil).
		effectiveCat := g.CategoryID
		if thompsonOn {
			if err := ensureBanditArmsForGroup(ctx, db, g.ID, g.ChannelID); err != nil {
				slog.Warn("algo.tick: ensureBanditArmsForGroup", "err", err, "group", g.ID)
			}
			if cat := selectCategoryThompson(ctx, db, g.ID, g.ChannelID); cat != nil {
				effectiveCat = cat
			}
		}
		candidates, err := selectTopKForGroup(ctx, db, g.ID, g.ChannelID, effectiveCat)
		if err != nil || len(candidates) == 0 {
			continue
		}
		sentToday, err := loadSentTodayCategories(ctx, db, g.ID)
		if err != nil {
			slog.Warn("algo.tick: loadSentTodayCategories", "err", err, "group", g.ID)
			sentToday = map[int64]bool{}
		}
		ranked := applyMMR(candidates, sentToday, lambda)
		if len(ranked) == 0 {
			continue
		}
		item := pickWithEpsilon(ctx, db, ranked)
		if err := enqueueSend(ctx, db, g.ID, item, item.FinalScore); err != nil {
			slog.Warn("algo.tick: enqueue", "err", err, "group", g.ID)
			continue
		}
		enqueued++
	}
	slog.Info("algo.tick: done", "enqueued", enqueued, "groups", len(groups), "lambda", lambda)
	recordTickResult(db, started, enqueued, "")
	return nil
}
