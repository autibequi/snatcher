package selection

import (
	"context"
	"log/slog"
	"strconv"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"snatcher/backendv2/internal/models"
	"snatcher/backendv2/internal/services/senders"
	"snatcher/backendv2/internal/services/sendwindow"
	"snatcher/backendv2/internal/services/target"
)

// RunSelectionTick é o job de seleção (substitui algo.tick removido na W1).
// Para cada grupo ativo com canal: respeita pacing/janela, ranqueia candidatos por
// target.Match + match.Score e enfileira o melhor no send_queue via outbox.
// Advisory lock garante exclusão mútua entre réplicas.
func RunSelectionTick(ctx context.Context, db *sqlx.DB) error {
	var locked bool
	if err := db.GetContext(ctx, &locked,
		`SELECT pg_try_advisory_lock(hashtext('selection_tick'))`); err != nil {
		return err
	}
	if !locked {
		slog.Debug("selection.tick: outra réplica detém o lock — skip")
		return nil
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `SELECT pg_advisory_unlock(hashtext('selection_tick'))`)
	}()

	type grp struct {
		ID        int64 `db:"id"`
		ChannelID int64 `db:"channel_id"`
		DailyCap  int   `db:"daily_msg_cap"`
	}
	var groups []grp
	if err := db.SelectContext(ctx, &groups, `
		SELECT g.id, g.channel_id, COALESCE(g.daily_msg_cap, 0) AS daily_msg_cap
		FROM groups g
		WHERE COALESCE(g.status, 'active') = 'active' AND g.channel_id IS NOT NULL`); err != nil {
		return err
	}

	writer := senders.NewOutboxWriter(db.DB)
	enqueued := 0
	for _, g := range groups {
		ok, err := selectAndEnqueueForGroup(ctx, db, writer, g.ID, g.ChannelID, g.DailyCap)
		if err != nil {
			slog.Warn("selection.tick: grupo falhou", "group", g.ID, "err", err)
			continue
		}
		if ok {
			enqueued++
		}
	}
	slog.Info("selection.tick done", "groups", len(groups), "enqueued", enqueued)
	return nil
}

// selectAndEnqueueForGroup escolhe e enfileira o melhor produto para um grupo.
// Retorna true se enfileirou algo.
func selectAndEnqueueForGroup(ctx context.Context, db *sqlx.DB, writer *senders.OutboxWriter, groupID, channelID int64, dailyCap int) (bool, error) {
	// pacing + janela de envio (reusa o gate preservado na W1).
	if !sendwindow.ShouldEnqueueGroup(ctx, db, groupID, dailyCap) {
		return false, nil
	}

	var ch models.ChannelV2
	if err := db.GetContext(ctx, &ch, `
		SELECT id, name, quality_threshold, daily_cap, active, created_at,
		       price_min, price_max, min_discount_pct
		FROM channels_v2 WHERE id = $1`, channelID); err != nil {
		return false, err
	}
	if !ch.Active {
		return false, nil
	}

	tcfg, err := loadTargetConfig(ctx, db, channelID)
	if err != nil {
		return false, err
	}

	// Resolve o modem do grupo (conta primary/backup, rotação por último envio).
	var modemID int64
	if err := db.GetContext(ctx, &modemID, `
		SELECT a.modem_id FROM group_admins ga
		JOIN accounts a ON a.id = ga.account_id
		WHERE ga.group_id = $1 AND a.status IN ('primary', 'backup')
		ORDER BY a.last_sent_at ASC NULLS FIRST
		LIMIT 1`, groupID); err != nil {
		// Sem conta WA vinculada — nada a enfileirar.
		return false, nil
	}

	cands, err := loadCandidates(ctx, db, groupID, ch.QualityThreshold)
	if err != nil {
		return false, err
	}
	ranked := Rank(cands, tcfg, ch)
	if len(ranked) == 0 {
		return false, nil
	}
	top := ranked[0]

	priority := int(top.Score * 100)
	if priority < 0 {
		priority = 0
	}
	if err := writer.WriteWithTx(ctx, senders.OutboxEntry{
		CatalogItemID: top.CatalogID,
		ModemID:       modemID,
		Recipient:     strconv.FormatInt(groupID, 10),
		Priority:      priority,
	}); err != nil {
		return false, err
	}
	return true, nil
}

// loadTargetConfig lê o público-alvo do canal (colunas W3).
func loadTargetConfig(ctx context.Context, db *sqlx.DB, channelID int64) (target.Config, error) {
	var cfg target.Config
	err := db.QueryRowContext(ctx, `
		SELECT COALESCE(target_categories, '{}'),
		       COALESCE(price_min, 0), COALESCE(price_max, 0),
		       COALESCE(blacklist, '{}'), COALESCE(whitelist, '{}')
		FROM channels_v2 WHERE id = $1`, channelID).
		Scan(pq.Array(&cfg.Categories), &cfg.PriceMin, &cfg.PriceMax,
			pq.Array(&cfg.Blacklist), pq.Array(&cfg.Whitelist))
	return cfg, err
}

// loadCandidates busca produtos do catálogo v2 elegíveis (send_ready, vivos, acima do
// threshold de qualidade) que ainda não foram enviados ao grupo (anti-repeat 7d) nem
// estão na fila.
func loadCandidates(ctx context.Context, db *sqlx.DB, groupID int64, threshold float64) ([]Candidate, error) {
	type row struct {
		ID         int64   `db:"id"`
		CategoryID *int64  `db:"category_id"`
		Price      float64 `db:"price_current"`
		PriceOrig  float64 `db:"price_original"`
		Title      string  `db:"title"`
		Quality    float64 `db:"quality_score"`
		Discount   float64 `db:"discount_pct"`
		DedupKey   string  `db:"dedup_key"`
	}
	var rows []row
	if err := db.SelectContext(ctx, &rows, `
		SELECT c.id, c.category_id,
		       COALESCE(c.price_current, 0) AS price_current,
		       COALESCE(c.price_original, 0) AS price_original,
		       COALESCE(c.title, '') AS title,
		       COALESCE(c.quality_score, 0) AS quality_score,
		       COALESCE(c.discount_pct, 0) AS discount_pct,
		       COALESCE(c.dedup_key, '') AS dedup_key
		FROM catalog c
		WHERE c.send_ready = true AND c.canonical_url_alive = true
		  AND COALESCE(c.quality_score, 0) >= $2
		  AND NOT EXISTS (
		      SELECT 1 FROM group_sent_history h
		      WHERE h.group_id = $1 AND h.dedup_key = c.dedup_key
		        AND h.sent_at > now() - INTERVAL '7 days')
		  AND NOT EXISTS (
		      SELECT 1 FROM send_queue q
		      WHERE q.group_id = $1 AND q.catalog_id = c.id
		        AND q.status IN ('pending', 'sending'))
		ORDER BY c.quality_score DESC NULLS LAST
		LIMIT 200`, groupID, threshold); err != nil {
		return nil, err
	}

	cands := make([]Candidate, 0, len(rows))
	for _, r := range rows {
		var catID int64
		if r.CategoryID != nil {
			catID = *r.CategoryID
		}
		cands = append(cands, Candidate{
			CatalogID:     r.ID,
			CategoryID:    catID,
			Price:         r.Price,
			PriceOriginal: r.PriceOrig,
			Title:        r.Title,
			QualityScore: r.Quality,
			DiscountPct:  r.Discount,
			DedupKey:     r.DedupKey,
		})
	}
	return cands, nil
}
