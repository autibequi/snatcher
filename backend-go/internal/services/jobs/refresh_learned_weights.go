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
	// Reescrito 2026-06-14: a versão antiga escrevia na tabela learned_weights
	// (singular, group-level) que foi DROPADA → INSERT dava 42P01 → no-op silencioso
	// → o motor NUNCA aprendia (CTR/EPC do deal_score ficavam 0). Agora computa
	// learned_weights_channel DIRETO de send_log + clicks, agregado por
	// (channel, category, source). EPC=0 até haver postback de conversão (follow-up).
	q := `
	WITH
	-- Sends por (channel, category, source, short_id) com decay temporal.
	base AS (
	    SELECT g.channel_id, c.category_id, c.source_id, c.short_id,
	           COUNT(*) AS sends_raw,
	           SUM(exp(-0.693
	                   * EXTRACT(EPOCH FROM (now() - sl.sent_at)) / 86400.0
	                   / GREATEST(COALESCE(get_param('learned_half_life_days','global',NULL), 7), 1)
	           )) AS sends_weighted
	    FROM send_log sl
	    JOIN catalog c ON c.id = sl.catalog_id
	    JOIN groups  g ON g.id = sl.group_id
	    WHERE sl.sent_at > now() - INTERVAL '30 days'
	      AND sl.status = 'sent'
	      AND c.category_id IS NOT NULL
	      AND c.source_id IS NOT NULL
	      AND g.channel_id IS NOT NULL
	    GROUP BY g.channel_id, c.category_id, c.source_id, c.short_id
	),
	-- Clicks por (short_id, group_id) com cap anti-viralização (k * members) + decay.
	clicks_agg AS (
	    SELECT cl.short_id, cl.group_id,
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
	-- Atribui clicks aos sends pelo (short_id, channel) — clicks via group→channel.
	joined AS (
	    SELECT b.channel_id, b.category_id, b.source_id,
	           b.sends_raw, b.sends_weighted,
	           COALESCE(SUM(ca.clicks_weighted), 0) AS clicks_weighted
	    FROM base b
	    LEFT JOIN clicks_agg ca
	           ON ca.short_id = b.short_id
	          AND (SELECT channel_id FROM groups WHERE id = ca.group_id) = b.channel_id
	    GROUP BY b.channel_id, b.category_id, b.source_id, b.short_id,
	             b.sends_raw, b.sends_weighted
	),
	final AS (
	    SELECT channel_id, category_id, source_id,
	           SUM(sends_raw)       AS sends_raw,
	           SUM(sends_weighted)  AS sends_weighted,
	           SUM(clicks_weighted) AS clicks_weighted
	    FROM joined
	    GROUP BY channel_id, category_id, source_id
	)
	INSERT INTO learned_weights_channel (channel_id, category_id, source_id,
	                                     ctr_30d, epc_30d, samples_30d, confidence, updated_at)
	SELECT
	    channel_id, category_id, source_id,
	    CASE WHEN sends_weighted > 0
	         THEN LEAST(clicks_weighted / sends_weighted, 1.0)
	         ELSE 0 END                          AS ctr_30d,
	    0                                        AS epc_30d,
	    sends_raw                                AS samples_30d,
	    LEAST(sends_raw::numeric / 200, 1.0)     AS confidence,
	    now()
	FROM final
	ON CONFLICT (channel_id, category_id, source_id) DO UPDATE
	SET ctr_30d     = EXCLUDED.ctr_30d,
	    epc_30d     = EXCLUDED.epc_30d,
	    samples_30d = EXCLUDED.samples_30d,
	    confidence  = EXCLUDED.confidence,
	    updated_at  = now();
	`
	res, err := db.ExecContext(ctx, q)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && string(pqErr.Code) == pgUndefinedTable {
			slog.Info("refresh_learned_weights: tabela ausente, skip", "detail", pqErr.Message)
			return nil
		}
		slog.Error("refresh_learned_weights", "err", err)
		return err
	}
	n, _ := res.RowsAffected()
	slog.Info("refresh_learned_weights: done", "rows", n)
	return nil
}
