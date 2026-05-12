package jobs

// NOTE: depende de send_log (Fase 4) + catalog (Fase 3). Roda no-op se tabelas ausentes.
// Erros "relation does not exist" (PG code 42P01) são capturados e ignorados silenciosamente.

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

const pgUndefinedTable = "42P01"

// RunRefreshLearnedWeights atualiza learned_weights.{ctr_30d, epc_30d, samples_30d, confidence}
// para cada (group_id, category_id, source_id) com dados dos últimos 30 dias.
// Cron diário 02:00.
func RunRefreshLearnedWeights(ctx context.Context, db *sqlx.DB) error {
	q := `
	WITH agg AS (
		SELECT
			sl.group_id,
			c.category_id,
			c.source_id,
			COUNT(DISTINCT sl.id)              AS sends,
			COUNT(DISTINCT cl.id)              AS clicks,
			COALESCE(SUM(cv.commission), 0)    AS commission
		FROM send_log sl
		LEFT JOIN catalog c ON c.id = sl.catalog_id
		LEFT JOIN clicks cl
			ON cl.short_id = c.short_id
		   AND cl.clicked_at > now() - INTERVAL '30 days'
		LEFT JOIN conversions cv
			ON cv.short_id = c.short_id
		   AND cv.occurred_at > now() - INTERVAL '30 days'
		WHERE sl.sent_at > now() - INTERVAL '30 days'
		  AND sl.status = 'sent'
		  AND c.category_id IS NOT NULL
		  AND c.source_id IS NOT NULL
		GROUP BY sl.group_id, c.category_id, c.source_id
	)
	INSERT INTO learned_weights (group_id, category_id, source_id, ctr_30d, epc_30d, samples_30d, confidence, updated_at)
	SELECT
		group_id,
		category_id,
		source_id,
		CASE WHEN sends > 0 THEN clicks::numeric / sends ELSE 0 END,
		CASE WHEN clicks > 0 THEN commission / clicks ELSE 0 END,
		sends,
		LEAST(sends::numeric / 200, 1.0),
		now()
	FROM agg
	ON CONFLICT (group_id, category_id, source_id) DO UPDATE
	SET ctr_30d      = EXCLUDED.ctr_30d,
		epc_30d      = EXCLUDED.epc_30d,
		samples_30d  = EXCLUDED.samples_30d,
		confidence   = EXCLUDED.confidence,
		updated_at   = now();
	`
	res, err := db.ExecContext(ctx, q)
	if err != nil {
		// Se tabela ainda não existe (send_log ou catalog são Fase 3/4), skip silencioso.
		if pqErr, ok := err.(*pq.Error); ok && string(pqErr.Code) == pgUndefinedTable {
			slog.Info("refresh_learned_weights: tabela ausente (Fase 3/4 pendente), skip", "detail", pqErr.Message)
			return nil
		}
		slog.Error("refresh_learned_weights", "err", err)
		return err
	}
	n, _ := res.RowsAffected()
	slog.Info("refresh_learned_weights: done", "rows", n)
	return nil
}
