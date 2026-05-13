package algo

import (
	"context"

	"github.com/jmoiron/sqlx"
)

type catalogItem struct {
	ID           int64   `db:"id"`
	ShortID      string  `db:"short_id"`
	CategoryID   *int64  `db:"category_id"`
	SourceID     string  `db:"source_id"`
	QualityScore float64 `db:"quality_score"`
	DiscountPct  float64 `db:"discount_pct"`
}

// selectTopForGroup seleciona o melhor item via SQL com hard skips:
// send_ready=true, quality_score >= threshold, canonical_url_alive=true,
// anti-repeat 7d, nao-na-fila.
func selectTopForGroup(ctx context.Context, db *sqlx.DB, groupID int64, categoryID *int64) (catalogItem, float64, bool) {
	var item catalogItem
	err := db.GetContext(ctx, &item, `
		SELECT c.id, c.short_id, c.category_id, c.source_id,
		       COALESCE(c.quality_score, 0) AS quality_score,
		       COALESCE(c.discount_pct, 0) AS discount_pct
		FROM catalog c
		WHERE c.send_ready = true
		  AND c.canonical_url_alive = true
		  AND COALESCE(c.quality_score, 0) >= COALESCE(
		      (SELECT current_value FROM tunable_parameters
		       WHERE param_name = 'quality_threshold' AND scope_type = 'global'),
		      0.4)
		  AND ($2::bigint IS NULL OR c.category_id = $2)
		  AND NOT EXISTS (
		      SELECT 1 FROM group_sent_history h
		      WHERE h.group_id = $1
		        AND h.dedup_key IN (SELECT dedup_key FROM catalog WHERE id = c.id)
		        AND h.sent_at > now() - INTERVAL '7 days'
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM send_queue q
		      WHERE q.group_id = $1
		        AND q.catalog_id = c.id
		        AND q.status IN ('pending', 'sending')
		  )
		ORDER BY c.quality_score DESC
		LIMIT 1
	`, groupID, categoryID)
	if err != nil {
		return item, 0, false
	}
	return item, item.QualityScore, true
}

// enqueueSend insere em send_queue (tabela criada na Fase 4 — graceful skip se ausente).
func enqueueSend(ctx context.Context, db *sqlx.DB, groupID int64, item catalogItem, score float64) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO send_queue (modem_id, group_id, catalog_id, score, enqueued_at, status)
		SELECT a.modem_id, $1, $2, $3, now(), 'pending'
		FROM accounts a
		JOIN group_admins ga ON ga.account_id = a.id
		WHERE ga.group_id = $1
		  AND a.status IN ('primary', 'backup')
		ORDER BY ga.priority ASC
		LIMIT 1
	`, groupID, item.ID, score)
	return err
}
