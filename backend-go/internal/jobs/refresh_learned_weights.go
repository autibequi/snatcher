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
// Cron horário (minuto 7).
//
// Decay temporal: cada evento é ponderado por exp(-ln(2) * age_days / half_life)
// onde half_life = tunable_parameters.learned_half_life_days (default 7).
// Assim cliques recentes pesam mais que cliques antigos dentro da janela.
func RunRefreshLearnedWeights(ctx context.Context, db *sqlx.DB) error {
	q := `
	WITH agg AS (
		SELECT
			sl.group_id,
			c.category_id,
			c.source_id,
			COUNT(DISTINCT sl.id) AS sends_raw,
			SUM(
				exp(-0.693
					* EXTRACT(EPOCH FROM (now() - sl.sent_at)) / 86400.0
					/ GREATEST(COALESCE(get_param('learned_half_life_days','global',NULL), 7), 1)
				)
			) AS sends_weighted,
			-- clicks: join lateral pra capturar todos os clicks do produto na janela.
			-- Decay aplicado por click.
			(
				SELECT COALESCE(SUM(
					exp(-0.693
						* EXTRACT(EPOCH FROM (now() - cl.clicked_at)) / 86400.0
						/ GREATEST(COALESCE(get_param('learned_half_life_days','global',NULL), 7), 1)
					)
				), 0)
				FROM clicks cl
				WHERE cl.short_id = c.short_id
				  AND cl.clicked_at > now() - INTERVAL '30 days'
				  AND (cl.group_id IS NULL OR cl.group_id = sl.group_id)
			) AS clicks_weighted,
			COUNT(DISTINCT cl_distinct.id) AS clicks_raw,
			COALESCE(SUM(cv.commission), 0) AS commission
		FROM send_log sl
		LEFT JOIN catalog c ON c.id = sl.catalog_id
		LEFT JOIN clicks cl_distinct
			ON cl_distinct.short_id = c.short_id
		   AND cl_distinct.clicked_at > now() - INTERVAL '30 days'
		   AND (cl_distinct.group_id IS NULL OR cl_distinct.group_id = sl.group_id)
		LEFT JOIN conversions cv
			ON cv.short_id = c.short_id
		   AND cv.occurred_at > now() - INTERVAL '30 days'
		WHERE sl.sent_at > now() - INTERVAL '30 days'
		  AND sl.status = 'sent'
		  AND c.category_id IS NOT NULL
		  AND c.source_id IS NOT NULL
		GROUP BY sl.group_id, c.category_id, c.source_id, c.short_id
	),
	agg_collapsed AS (
		-- Collapse das múltiplas linhas por short_id em uma só por (group, cat, src):
		-- soma os clicks_weighted (já normalizados por short_id na CTE acima) e
		-- mantém sends_weighted (que é por send, não por click).
		SELECT
			group_id,
			category_id,
			source_id,
			SUM(sends_raw)       AS sends_raw,
			SUM(sends_weighted)  AS sends_weighted,
			-- clicks_weighted está repetido por linha (efeito do GROUP BY com short_id),
			-- mas como cada short_id aparece 1x no GROUP, a soma é correta.
			SUM(clicks_weighted) AS clicks_weighted,
			SUM(clicks_raw)      AS clicks_raw,
			SUM(commission)      AS commission
		FROM agg
		GROUP BY group_id, category_id, source_id
	)
	INSERT INTO learned_weights (group_id, category_id, source_id, ctr_30d, epc_30d, samples_30d, confidence, updated_at)
	SELECT
		group_id,
		category_id,
		source_id,
		CASE WHEN sends_weighted > 0
		     THEN LEAST(clicks_weighted / sends_weighted, 1.0)
		     ELSE 0 END                                    AS ctr_30d,
		CASE WHEN clicks_raw > 0
		     THEN commission / clicks_raw
		     ELSE 0 END                                    AS epc_30d,
		sends_raw                                          AS samples_30d,
		LEAST(sends_raw::numeric / 200, 1.0)               AS confidence,
		now()
	FROM agg_collapsed
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
