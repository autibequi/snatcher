package jobs

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunRecomputeQualityScores atualiza catalog.quality_score via fórmula cimentada.
// Cron 1h. Cobre itens com updated_at recente ou sem score.
func RunRecomputeQualityScores(ctx context.Context, db *sqlx.DB) error {
	q := `
	UPDATE catalog SET
	    quality_score = LEAST(GREATEST(
	        COALESCE(LEAST(discount_pct / 30.0, 2.0), 0)
	        * COALESCE((SELECT trust_score FROM sources WHERE id = catalog.source_id), 0.7)
	        * CASE WHEN last_price_drop_at IS NOT NULL
	                AND last_price_drop_at > now() - INTERVAL '24h'
	               THEN 1.5 ELSE 1.0 END
	        * EXP(-EXTRACT(EPOCH FROM (now() - created_at)) / (7 * 24 * 3600))
	    , 0), 1),
	    quality_score_at = now()
	WHERE quality_score_at IS NULL
	   OR quality_score_at < now() - INTERVAL '1 hour'
	   OR updated_at > quality_score_at;
	`
	res, err := db.ExecContext(ctx, q)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	slog.Info("recompute_quality_scores: done", "rows", n)
	return nil
}
