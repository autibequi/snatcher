package algo

import (
	"context"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
)

// RunTick executa 1 ciclo do Algo cimentado (5 camadas). Cron 5min.
func RunTick(ctx context.Context, db *sqlx.DB) error {
	started := time.Now()

	// 1. Janela de envio configurada nas settings (send_start_hour / send_end_hour)
	if !InSendWindow(ctx, db) {
		return nil // pausado — não registra
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
		ChannelID   *int64 `db:"channel_id"` // nullable — grupos sem canal são pulados
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
		// Pula grupos sem canal — não há como aplicar channel_category_weights.
		if g.ChannelID == nil {
			slog.Debug("algo.tick: grupo sem channel_id, pulando", "group", g.ID)
			continue
		}
		channelID := *g.ChannelID

		if !ShouldEnqueueGroup(ctx, db, g.ID, g.DailyMsgCap) {
			continue
		}
		// Categoria efetiva: se Thompson ativo, amostra do bandit;
		// senão usa a categoria fixa do grupo (g.CategoryID, pode ser nil).
		effectiveCat := g.CategoryID
		if thompsonOn {
			if err := ensureBanditArmsForGroup(ctx, db, g.ID, channelID); err != nil {
				slog.Warn("algo.tick: ensureBanditArmsForGroup", "err", err, "group", g.ID)
			}
			if cat := selectCategoryThompson(ctx, db, g.ID, channelID); cat != nil {
				effectiveCat = cat
			}
		}
		candidates, err := selectTopKForGroup(ctx, db, g.ID, channelID, effectiveCat)
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
