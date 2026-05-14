package jobs

// NOTE: depende de send_log + catalog + clicks + conversions. Roda no-op se tabelas
// ausentes — erros 42P01 capturados.

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

const pgUndefinedTable = "42P01"

// RunRefreshLearnedWeights atualiza learned_weights.{ctr_30d, epc_30d, samples_30d, confidence}
// para cada (group_id, category_id, source_id) com dados dos últimos 30 dias. Cron horário.
//
// Decay temporal: cada evento pesa exp(-ln(2) * age_days / half_life). Default
// half_life = 7d. Clicks de hoje pesam 2× os de 7d atrás.
//
// Pré-agregação por CTE separada evita cartesian entre sends × clicks × conversions
// (bug histórico — SUM(commission) ficava inflado por sends×clicks).
//
// Política de clicks anônimos: ignorados (cl.group_id IS NULL → não atribui). Consistente
// com Thompson Sampling.
func RunRefreshLearnedWeights(ctx context.Context, db *sqlx.DB) error {
	q := `
	WITH
	-- 1. Sends por (group, category, source, short_id) com decay.
	base AS (
	    SELECT sl.group_id, c.category_id, c.source_id, c.short_id,
	           COUNT(*) AS sends_raw,
	           SUM(exp(-0.693
	                   * EXTRACT(EPOCH FROM (now() - sl.sent_at)) / 86400.0
	                   / GREATEST(COALESCE(get_param('learned_half_life_days','global',NULL), 7), 1)
	           )) AS sends_weighted
	    FROM send_log sl
	    JOIN catalog c ON c.id = sl.catalog_id
	    WHERE sl.sent_at > now() - INTERVAL '30 days'
	      AND sl.status = 'sent'
	      AND c.category_id IS NOT NULL
	      AND c.source_id IS NOT NULL
	    GROUP BY sl.group_id, c.category_id, c.source_id, c.short_id
	),
	-- 2. Clicks por (short_id, group_id) — atribuídos só quando group_id presente.
	--    Aplica cap anti-viralização: clicks excedentes (acima de k*members)
	--    são ignorados pelo learning. Excedente vira sinal observacional
	--    separado em group_virality.
	clicks_agg AS (
	    SELECT cl.short_id, cl.group_id,
	           LEAST(
	             COUNT(*)::numeric,
	             GREATEST(g.member_count, 1)
	               * COALESCE(get_param('click_cap_per_member','global',NULL), 3.0)
	           ) AS clicks_raw,
	           LEAST(
	             SUM(exp(-0.693
	                     * EXTRACT(EPOCH FROM (now() - cl.clicked_at)) / 86400.0
	                     / GREATEST(COALESCE(get_param('learned_half_life_days','global',NULL), 7), 1)
	             )),
	             GREATEST(g.member_count, 1)
	               * COALESCE(get_param('click_cap_per_member','global',NULL), 3.0)
	           ) AS clicks_weighted
	    FROM clicks cl
	    JOIN groups g ON g.id = cl.group_id
	    WHERE cl.clicked_at > now() - INTERVAL '30 days'
	      AND cl.group_id IS NOT NULL
	    GROUP BY cl.short_id, cl.group_id, g.member_count
	),
	-- 3. Conversões por (short_id, group_id) — análogo a clicks.
	conv_agg AS (
	    SELECT cv.short_id, cv.group_id,
	           COUNT(*)        AS conv_raw,
	           SUM(COALESCE(cv.commission, 0)) AS commission
	    FROM conversions cv
	    WHERE cv.occurred_at > now() - INTERVAL '30 days'
	      AND cv.group_id IS NOT NULL
	    GROUP BY cv.short_id, cv.group_id
	),
	-- 4. JOIN 1:1:1 entre base, clicks_agg e conv_agg pelo (short_id, group_id).
	joined AS (
	    SELECT b.group_id, b.category_id, b.source_id,
	           b.sends_raw, b.sends_weighted,
	           COALESCE(ca.clicks_raw, 0)      AS clicks_raw,
	           COALESCE(ca.clicks_weighted, 0) AS clicks_weighted,
	           COALESCE(cv.commission, 0)      AS commission
	    FROM base b
	    LEFT JOIN clicks_agg ca
	           ON ca.short_id = b.short_id
	          AND ca.group_id = b.group_id
	    LEFT JOIN conv_agg   cv
	           ON cv.short_id = b.short_id
	          AND cv.group_id = b.group_id
	),
	-- 5. Collapse final por (group, category, source).
	final AS (
	    SELECT group_id, category_id, source_id,
	           SUM(sends_raw)        AS sends_raw,
	           SUM(sends_weighted)   AS sends_weighted,
	           SUM(clicks_raw)       AS clicks_raw,
	           SUM(clicks_weighted)  AS clicks_weighted,
	           SUM(commission)       AS commission
	    FROM joined
	    GROUP BY group_id, category_id, source_id
	)
	INSERT INTO learned_weights (group_id, category_id, source_id,
	                             ctr_30d, epc_30d, samples_30d, confidence, updated_at)
	SELECT
	    group_id,
	    category_id,
	    source_id,
	    CASE WHEN sends_weighted > 0
	         THEN LEAST(clicks_weighted / sends_weighted, 1.0)
	         ELSE 0 END                                AS ctr_30d,
	    CASE WHEN clicks_raw > 0
	         THEN commission / clicks_raw
	         ELSE 0 END                                AS epc_30d,
	    sends_raw                                      AS samples_30d,
	    LEAST(sends_raw::numeric / 200, 1.0)           AS confidence,
	    now()
	FROM final
	ON CONFLICT (group_id, category_id, source_id) DO UPDATE
	SET ctr_30d     = EXCLUDED.ctr_30d,
	    epc_30d     = EXCLUDED.epc_30d,
	    samples_30d = EXCLUDED.samples_30d,
	    confidence  = EXCLUDED.confidence,
	    updated_at  = now();
	`
	res, err := db.ExecContext(ctx, q)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && string(pqErr.Code) == pgUndefinedTable {
			slog.Info("refresh_learned_weights: tabela ausente (Fase 3/4 pendente), skip", "detail", pqErr.Message)
			return nil
		}
		slog.Error("refresh_learned_weights", "err", err)
		return err
	}
	n, _ := res.RowsAffected()

	// Agregação channel-level via rollup do learned_weights (group → channel).
	// Reaproveita o decay já aplicado pela query anterior. EPC e CTR são
	// médias ponderadas por samples_30d (que reflete o peso real de cada grupo).
	rollupQ := `
	INSERT INTO learned_weights_channel (channel_id, category_id, source_id,
	                                     ctr_30d, epc_30d, samples_30d, confidence, updated_at)
	SELECT g.channel_id, lw.category_id, lw.source_id,
	       CASE WHEN SUM(lw.samples_30d) > 0
	            THEN SUM(lw.ctr_30d * lw.samples_30d) / SUM(lw.samples_30d)
	            ELSE 0 END,
	       CASE WHEN SUM(lw.samples_30d) > 0
	            THEN SUM(lw.epc_30d * lw.samples_30d) / SUM(lw.samples_30d)
	            ELSE 0 END,
	       SUM(lw.samples_30d),
	       LEAST(SUM(lw.samples_30d)::numeric / 500, 1.0),
	       now()
	FROM learned_weights lw
	JOIN groups g ON g.id = lw.group_id
	WHERE g.channel_id IS NOT NULL
	GROUP BY g.channel_id, lw.category_id, lw.source_id
	ON CONFLICT (channel_id, category_id, source_id) DO UPDATE
	SET ctr_30d     = EXCLUDED.ctr_30d,
	    epc_30d     = EXCLUDED.epc_30d,
	    samples_30d = EXCLUDED.samples_30d,
	    confidence  = EXCLUDED.confidence,
	    updated_at  = now();
	`
	if _, err := db.ExecContext(ctx, rollupQ); err != nil {
		if pqErr, ok := err.(*pq.Error); ok && string(pqErr.Code) == pgUndefinedTable {
			slog.Info("refresh_learned_weights: rollup channel ausente, skip")
		} else {
			slog.Warn("refresh_learned_weights: rollup channel", "err", err)
		}
	}

	slog.Info("refresh_learned_weights: done", "rows", n)
	return nil
}
