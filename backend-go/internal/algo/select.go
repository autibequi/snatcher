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
	FinalScore   float64 `db:"final_score"`
}

const topK = 10

// selectTopKForGroup retorna os top-K candidatos ranqueados pela fórmula
// composta (Fase 1 do plano scoring v2). Hard skips iguais à versão antiga
// (send_ready, URL viva, threshold de qualidade, anti-repeat 7d, dedup de fila).
//
// final_score = w_q*quality + w_a*affinity + w_w*channel_weight
//             + w_c*ctr_30d + w_e*epc_30d + w_f*freshness
//             - w_s*saturation
func selectTopKForGroup(ctx context.Context, db *sqlx.DB, groupID, channelID int64, categoryID *int64) ([]catalogItem, error) {
	var items []catalogItem
	err := db.SelectContext(ctx, &items, `
		WITH gst AS (
			SELECT cat.category_id, COUNT(*) AS n_sent
			FROM send_log sl
			JOIN catalog cat ON cat.id = sl.catalog_id
			WHERE sl.group_id = $1
			  AND sl.sent_at > now() - INTERVAL '24 hours'
			GROUP BY cat.category_id
		)
		SELECT c.id, c.short_id, c.category_id, c.source_id,
		       COALESCE(c.quality_score, 0) AS quality_score,
		       COALESCE(c.discount_pct, 0)  AS discount_pct,
		         (get_param('score_weight_quality','global',NULL) * COALESCE(c.quality_score, 0))
		       + (get_param('score_weight_affinity','global',NULL) * COALESCE(gca.affinity, 0.5))
		       + (get_param('score_weight_channel','global',NULL)  * COALESCE(ccw.weight, 0) / 100.0)
		       + (get_param('score_weight_ctr','global',NULL)      * COALESCE(lw_agg.ctr_30d, 0))
		       + (get_param('score_weight_epc','global',NULL)      * LEAST(COALESCE(lw_agg.epc_30d, 0), 1.0))
		       + (get_param('score_weight_freshness','global',NULL)
		            * exp(-0.693
		                  * EXTRACT(EPOCH FROM (now() - COALESCE(c.send_ready_at, c.created_at)))
		                  / 3600.0
		                  / GREATEST(get_param('half_life_freshness','global',NULL) * 24.0, 1.0)))
		       - (get_param('score_weight_saturation','global',NULL)
		            * power(get_param('anti_saturation_decay','global',NULL),
		                    COALESCE(gst.n_sent, 0)))
		         AS final_score
		FROM catalog c
		LEFT JOIN group_category_affinity gca
		       ON gca.group_id = $1 AND gca.category_id = c.category_id
		LEFT JOIN channel_category_weights ccw
		       ON ccw.channel_id = $2 AND ccw.category_id = c.category_id
		LEFT JOIN LATERAL (
		    SELECT AVG(ctr_30d)::numeric AS ctr_30d, AVG(epc_30d)::numeric AS epc_30d
		    FROM learned_weights lw
		    WHERE lw.group_id = $1 AND lw.category_id = c.category_id
		) lw_agg ON true
		LEFT JOIN gst ON gst.category_id = c.category_id
		LEFT JOIN LATERAL (
		    SELECT MAX(sent_at)              AS last_sent_at,
		           MAX(price_at_send)        AS last_price_at_send
		    FROM group_sent_history h
		    WHERE h.group_id = $1 AND h.dedup_key = c.dedup_key
		) sent ON true
		WHERE c.send_ready = true
		  AND c.canonical_url_alive = true
		  AND COALESCE(c.quality_score, 0) >= COALESCE(
		      get_param('quality_threshold','global',NULL), 0.4)
		  AND ($3::bigint IS NULL OR c.category_id = $3)
		  -- Anti-repeat com bypass condicional ("re-promo"):
		  --   A) nunca enviado nesse grupo
		  --   B) janela padrão expirou (default 7d, ou 14d se preço subiu)
		  --   C) bypass: preço caiu de novo após o envio + queda mínima
		  --             E respeitando cooldown mínimo entre re-envios
		  AND (
		      sent.last_sent_at IS NULL
		      OR sent.last_sent_at < now() - (
		          CASE WHEN sent.last_price_at_send IS NOT NULL
		                    AND c.price_current > sent.last_price_at_send
		               THEN get_param('antirepeat_window_days_price_up','global',NULL)
		               ELSE get_param('antirepeat_window_days','global',NULL)
		          END * INTERVAL '1 day')
		      OR (
		          c.last_price_drop_at IS NOT NULL
		          AND sent.last_price_at_send IS NOT NULL
		          AND sent.last_price_at_send > 0
		          AND c.last_price_drop_at > sent.last_sent_at
		          AND sent.last_sent_at < now()
		              - get_param('repromo_cooldown_hours','global',NULL) * INTERVAL '1 hour'
		          AND (sent.last_price_at_send - c.price_current)
		              / sent.last_price_at_send
		              >= get_param('repromo_drop_threshold','global',NULL)
		      )
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM send_queue q
		      WHERE q.group_id = $1
		        AND q.catalog_id = c.id
		        AND q.status IN ('pending', 'sending')
		  )
		ORDER BY final_score DESC
		LIMIT $4
	`, groupID, channelID, categoryID, topK)
	return items, err
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
