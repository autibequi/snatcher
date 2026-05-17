package algo

import (
	"context"
	"log/slog"
	"sort"
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

	// Carrega parâmetros tunáveis uma vez por tick (shared por todos os grupos).
	params, err := LoadParams(ctx, db)
	if err != nil {
		slog.Warn("algo.tick: LoadParams", "err", err)
		// Continua com params zero — ComputeScoreV2 degradará gracefully (half-life=0 → exp(0)=1).
	}

	// Thompson Sampling incondicional — toggle use_thompson_sampling queimado em W0.
	if err := updateBanditArms(ctx, db); err != nil {
		slog.Warn("algo.tick: updateBanditArms", "err", err)
	}
	if err := updateBanditArmsChannel(ctx, db); err != nil {
		slog.Warn("algo.tick: updateBanditArmsChannel", "err", err)
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
		// Categoria efetiva: amostra do bandit Thompson (incondicional pós-W0).
		// g.CategoryID é usado como fallback se não há braços ainda.
		effectiveCat := g.CategoryID
		if err := ensureBanditArmsForGroup(ctx, db, g.ID, channelID); err != nil {
			slog.Warn("algo.tick: ensureBanditArmsForGroup", "err", err, "group", g.ID)
		}
		if cat := selectCategoryThompson(ctx, db, g.ID, channelID); cat != nil {
			effectiveCat = cat
		}
		candidates, err := selectTopKForGroup(ctx, db, g.ID, channelID, effectiveCat)
		if err != nil || len(candidates) == 0 {
			continue
		}

		// W2.B — Bandit UCB1 por canal: re-pontua candidatos com pesos do braço selecionado.
		bandit, err := LoadBandit(ctx, db, channelID)
		if err != nil {
			slog.Warn("algo.tick: LoadBandit", "err", err, "channel", channelID)
			bandit = &ContextualBandit{ChannelID: channelID, Arms: defaultSafeArms()}
		}
		armID := bandit.Pick(ctx, params.EpsilonBase)
		arm := bandit.ArmByID(armID)
		for i := range candidates {
			c := &candidates[i]
			in := ScoreInputs{
				CategoryID:         c.CategoryID,
				DiscountPct:        c.DiscountPct,
				FirstSeenAt:        c.FirstSeenAt,
				LastPriceDropAt:    c.LastPriceDropAt,
				SourceTrust:        c.QualityScore, // melhor proxy disponível sem JOIN extra
				GroupCategoryMatch: 1.0,            // itens já passaram pelo filtro de categoria
				ChannelID:          channelID,
			}
			c.FinalScore = ComputeScoreV2(in, params, &arm.Weights)
		}
		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].FinalScore > candidates[j].FinalScore
		})

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

		// Registra o reward (FinalScore já re-pontado por V2) e persiste o bandit.
		bandit.Update(armID, item.FinalScore)
		if err := SaveBandit(ctx, db, bandit, "tick"); err != nil {
			slog.Warn("algo.tick: SaveBandit", "err", err, "channel", channelID)
		}

		enqueued++
	}
	slog.Info("algo.tick: done", "enqueued", enqueued, "groups", len(groups), "lambda", lambda)
	recordTickResult(db, started, enqueued, "")
	return nil
}
