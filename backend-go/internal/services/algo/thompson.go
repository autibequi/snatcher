package algo

import (
	"context"
	"math"
	"math/rand"

	"github.com/jmoiron/sqlx"
)

// sampleGamma amostra de Gamma(shape, 1) usando Marsaglia & Tsang (2000).
// Para shape < 1 usa o trick: Gamma(shape) = Gamma(shape+1) * U^(1/shape).
func sampleGamma(shape float64) float64 {
	if shape <= 0 {
		return 0
	}
	if shape < 1 {
		u := rand.Float64()
		if u == 0 {
			u = 1e-12
		}
		return sampleGamma(shape+1) * math.Pow(u, 1.0/shape)
	}
	d := shape - 1.0/3.0
	c := 1.0 / math.Sqrt(9.0*d)
	for {
		x := rand.NormFloat64()
		v := 1 + c*x
		if v <= 0 {
			continue
		}
		v = v * v * v
		u := rand.Float64()
		if u < 1-0.0331*x*x*x*x {
			return d * v
		}
		if math.Log(u) < 0.5*x*x+d*(1-v+math.Log(v)) {
			return d * v
		}
	}
}

// sampleBeta amostra de Beta(alpha, beta) via dois Gammas:
//
//	X ~ Gamma(alpha), Y ~ Gamma(beta), Beta = X / (X+Y)
func sampleBeta(alpha, beta float64) float64 {
	x := sampleGamma(alpha)
	y := sampleGamma(beta)
	if x+y == 0 {
		return 0.5
	}
	return x / (x + y)
}

type banditArm struct {
	CategoryID int64   `db:"category_id"`
	Alpha      float64 `db:"alpha"`
	Beta       float64 `db:"beta"`
}

// selectCategoryThompson amostra Beta para cada (groupID, categoria) e devolve
// o argmax. Retorna nil se não houver braços (deixa o caller cair no fluxo
// Fase 1 sem filtrar categoria).
//
// Inclui também as categorias que aparecem em channel_category_weights mas
// ainda não têm bandit_arm — inicializa virtualmente como Beta(1,1) para
// permitir descoberta de categorias zero-shot do canal.
func selectCategoryThompson(ctx context.Context, db *sqlx.DB, groupID, channelID int64) *int64 {
	var arms []banditArm
	err := db.SelectContext(ctx, &arms, `
		WITH eligible AS (
		    SELECT category_id FROM bandit_arms WHERE group_id = $1
		    UNION
		    SELECT category_id FROM channel_category_weights
		    WHERE channel_id = $2 AND weight > 0
		)
		SELECT e.category_id,
		       COALESCE(ba.alpha, 1.0) AS alpha,
		       COALESCE(ba.beta,  1.0) AS beta
		FROM eligible e
		LEFT JOIN bandit_arms ba
		       ON ba.group_id = $1 AND ba.category_id = e.category_id
	`, groupID, channelID)
	if err != nil || len(arms) == 0 {
		return nil
	}

	var (
		bestCat   int64
		bestScore = -1.0
	)
	for _, a := range arms {
		s := sampleBeta(a.Alpha, a.Beta)
		if s > bestScore {
			bestScore = s
			bestCat = a.CategoryID
		}
	}
	return &bestCat
}

// updateBanditArms processa send_log/conversions/clicks novos e atualiza alpha/beta
// de cada (group_id, category_id). Idempotente.
//
// Três cursores independentes por arm:
//   - cursor_conversions: avança até o MAX(occurred_at) do batch processado
//   - cursor_clicks:      avança até o MAX(clicked_at) do batch processado
//   - cursor_losses:      avança até now() - 24h (mantém maturidade)
//
// Sinais:
//   - Conversão           → alpha += 1
//   - Click (atribuído)   → alpha += click_reward_weight (default 0.10)
//   - Envio >24h sem conv → beta  += 1
//
// Política de clicks anônimos: ignorados (mesma política do
// refresh_learned_weights — clicks sem group_id não atribuem).
func updateBanditArms(ctx context.Context, db *sqlx.DB) error {
	// 1. Conversões — alpha += n; cursor avança até MAX(occurred_at).
	_, err := db.ExecContext(ctx, `
		WITH new_conv AS (
		    SELECT cv.group_id, cat.category_id,
		           MAX(cv.occurred_at) AS max_at,
		           COUNT(*)            AS n
		    FROM conversions cv
		    JOIN catalog cat ON cat.id = cv.catalog_id
		    JOIN bandit_arms ba
		       ON ba.group_id = cv.group_id
		      AND ba.category_id = cat.category_id
		    WHERE cv.occurred_at > ba.cursor_conversions
		      AND cat.category_id IS NOT NULL
		    GROUP BY cv.group_id, cat.category_id
		)
		UPDATE bandit_arms ba
		SET alpha = ba.alpha + nc.n,
		    cursor_conversions = GREATEST(ba.cursor_conversions, nc.max_at),
		    updated_at = now()
		FROM new_conv nc
		WHERE ba.group_id = nc.group_id
		  AND ba.category_id = nc.category_id
	`)
	if err != nil {
		return err
	}

	// 2. Clicks — alpha += effective_clicks * click_reward_weight.
	//    effective_clicks = LEAST(n, k * member_count) protege contra
	//    viralização externa. Cursor avança até MAX(clicked_at).
	//    Clicks com group_id NULL são ignorados (consistência com refresh).
	_, err = db.ExecContext(ctx, `
		WITH new_clicks AS (
		    SELECT cl.group_id, cat.category_id,
		           MAX(cl.clicked_at) AS max_at,
		           COUNT(*)           AS n_raw,
		           MAX(g.member_count) AS members
		    FROM clicks cl
		    JOIN catalog cat ON cat.id = cl.catalog_id
		    JOIN groups g   ON g.id = cl.group_id
		    JOIN bandit_arms ba
		       ON ba.group_id = cl.group_id
		      AND ba.category_id = cat.category_id
		    WHERE cl.clicked_at > ba.cursor_clicks
		      AND cat.category_id IS NOT NULL
		      AND cl.group_id IS NOT NULL
		    GROUP BY cl.group_id, cat.category_id
		),
		capped AS (
		    SELECT group_id, category_id, max_at,
		           LEAST(
		             n_raw::numeric,
		             GREATEST(members, 1)
		               * COALESCE(get_param('click_cap_per_member','global',NULL), 3.0)
		           ) AS n_effective
		    FROM new_clicks
		)
		UPDATE bandit_arms ba
		SET alpha = ba.alpha + c.n_effective * COALESCE(get_param('click_reward_weight','global',NULL), 0.10),
		    cursor_clicks = GREATEST(ba.cursor_clicks, c.max_at),
		    updated_at = now()
		FROM capped c
		WHERE ba.group_id = c.group_id
		  AND ba.category_id = c.category_id
	`)
	if err != nil {
		return err
	}

	// 3. Losses — beta += n para envios >24h sem conversão. Cursor avança até
	//    now()-24h (envios mais novos ainda podem ganhar conversão tardia).
	_, err = db.ExecContext(ctx, `
		WITH new_loss AS (
		    SELECT sl.group_id, cat.category_id, COUNT(*) AS n
		    FROM send_log sl
		    JOIN catalog cat ON cat.id = sl.catalog_id
		    JOIN bandit_arms ba
		       ON ba.group_id = sl.group_id
		      AND ba.category_id = cat.category_id
		    WHERE sl.sent_at > ba.cursor_losses
		      AND sl.sent_at <= now() - INTERVAL '24 hours'
		      AND cat.category_id IS NOT NULL
		      AND sl.status = 'sent'
		      AND NOT EXISTS (
		          SELECT 1 FROM conversions cv
		          WHERE cv.catalog_id = sl.catalog_id
		            AND cv.group_id = sl.group_id
		            AND cv.occurred_at BETWEEN sl.sent_at AND sl.sent_at + INTERVAL '24 hours'
		      )
		    GROUP BY sl.group_id, cat.category_id
		)
		UPDATE bandit_arms ba
		SET beta = ba.beta + nl.n,
		    cursor_losses = now() - INTERVAL '24 hours',
		    updated_at = now()
		FROM new_loss nl
		WHERE ba.group_id = nl.group_id
		  AND ba.category_id = nl.category_id
	`)
	return err
}

// ensureBanditArmsForGroup cria braços faltantes para o grupo. Warm-start
// hierárquico: se já existe bandit_arms_channel pro canal, herda α/β
// proporcional (limita a 25% do peso do canal pra deixar margem de
// aprendizado próprio); caso contrário Beta(1,1) neutro.
func ensureBanditArmsForGroup(ctx context.Context, db *sqlx.DB, groupID, channelID int64) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO bandit_arms (group_id, category_id, alpha, beta,
		                         cursor_conversions, cursor_clicks, cursor_losses)
		SELECT $1, ccw.category_id,
		       GREATEST(1.0, COALESCE(bac.alpha, 1.0) * 0.25),
		       GREATEST(1.0, COALESCE(bac.beta,  1.0) * 0.25),
		       now() - INTERVAL '24 hours',
		       now() - INTERVAL '24 hours',
		       now() - INTERVAL '24 hours'
		FROM channel_category_weights ccw
		LEFT JOIN bandit_arms_channel bac
		       ON bac.channel_id = ccw.channel_id
		      AND bac.category_id = ccw.category_id
		WHERE ccw.channel_id = $2 AND ccw.weight > 0
		ON CONFLICT (group_id, category_id) DO NOTHING
	`, groupID, channelID)
	return err
}

// updateBanditArmsChannel agrega bandit_arms (group-level) por canal. Reaproveita
// os α/β já atualizados em updateBanditArms — chamado logo depois.
func updateBanditArmsChannel(ctx context.Context, db *sqlx.DB) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO bandit_arms_channel (channel_id, category_id, alpha, beta,
		                                 cursor_conversions, cursor_clicks, cursor_losses, updated_at)
		SELECT g.channel_id, ba.category_id,
		       SUM(ba.alpha), SUM(ba.beta),
		       MAX(ba.cursor_conversions), MAX(ba.cursor_clicks), MAX(ba.cursor_losses),
		       now()
		FROM bandit_arms ba
		JOIN groups g ON g.id = ba.group_id
		WHERE g.channel_id IS NOT NULL
		GROUP BY g.channel_id, ba.category_id
		ON CONFLICT (channel_id, category_id) DO UPDATE
		SET alpha = EXCLUDED.alpha,
		    beta  = EXCLUDED.beta,
		    cursor_conversions = EXCLUDED.cursor_conversions,
		    cursor_clicks      = EXCLUDED.cursor_clicks,
		    cursor_losses      = EXCLUDED.cursor_losses,
		    updated_at = now()
	`)
	return err
}
