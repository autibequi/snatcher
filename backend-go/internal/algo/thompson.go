package algo

import (
	"context"
	"math"
	"math/rand"

	"github.com/jmoiron/sqlx"
)

// thompsonEnabled lê a flag use_thompson_sampling do banco.
func thompsonEnabled(ctx context.Context, db *sqlx.DB) bool {
	var v float64
	if err := db.GetContext(ctx, &v,
		`SELECT COALESCE(get_param('use_thompson_sampling','global',NULL), 0)`); err != nil {
		return false
	}
	return v != 0
}

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

// updateBanditArms processa send_log e conversions mais novos que processed_up_to
// e atualiza alpha/beta de cada (group_id, category_id). Idempotente — chama
// no início do tick antes da seleção.
//
// Conversão → alpha += 1
// Envio sem conversão (após janela de 24h) → beta += 1
func updateBanditArms(ctx context.Context, db *sqlx.DB) error {
	// 1. Adiciona +1 em alpha para cada conversão nova com category_id conhecido.
	_, err := db.ExecContext(ctx, `
		WITH new_conv AS (
		    SELECT cv.group_id, cat.category_id, MAX(cv.occurred_at) AS max_at, COUNT(*) AS n
		    FROM conversions cv
		    JOIN catalog cat ON cat.id = cv.catalog_id
		    JOIN bandit_arms ba
		       ON ba.group_id = cv.group_id
		      AND ba.category_id = cat.category_id
		    WHERE cv.occurred_at > ba.processed_up_to
		      AND cat.category_id IS NOT NULL
		    GROUP BY cv.group_id, cat.category_id
		)
		UPDATE bandit_arms ba
		SET alpha = ba.alpha + nc.n,
		    updated_at = now()
		FROM new_conv nc
		WHERE ba.group_id = nc.group_id
		  AND ba.category_id = nc.category_id
	`)
	if err != nil {
		return err
	}

	// 1b. Recompensa parcial por click (alpha += click_reward_weight).
	//     Clicks são ~10-50x mais frequentes que conversões, então o bandit
	//     converge muito mais rápido. O peso é tunable; default 0.10 (10 clicks
	//     ≈ 1 conversão de recompensa).
	_, err = db.ExecContext(ctx, `
		WITH new_clicks AS (
		    SELECT cl.group_id, cat.category_id, COUNT(*) AS n
		    FROM clicks cl
		    JOIN catalog cat ON cat.id = cl.catalog_id
		    JOIN bandit_arms ba
		       ON ba.group_id = cl.group_id
		      AND ba.category_id = cat.category_id
		    WHERE cl.clicked_at > ba.processed_up_to
		      AND cat.category_id IS NOT NULL
		      AND cl.group_id IS NOT NULL
		    GROUP BY cl.group_id, cat.category_id
		)
		UPDATE bandit_arms ba
		SET alpha = ba.alpha + nc.n * COALESCE(get_param('click_reward_weight','global',NULL), 0.10),
		    updated_at = now()
		FROM new_clicks nc
		WHERE ba.group_id = nc.group_id
		  AND ba.category_id = nc.category_id
	`)
	if err != nil {
		return err
	}

	// 2. Adiciona +1 em beta para cada envio (>24h atrás, sem conversão correspondente).
	//    Só consideramos sends já "maduros" para evitar contar como derrota um
	//    envio cuja conversão ainda pode chegar.
	_, err = db.ExecContext(ctx, `
		WITH new_loss AS (
		    SELECT sl.group_id, cat.category_id, MAX(sl.sent_at) AS max_at, COUNT(*) AS n
		    FROM send_log sl
		    JOIN catalog cat ON cat.id = sl.catalog_id
		    JOIN bandit_arms ba
		       ON ba.group_id = sl.group_id
		      AND ba.category_id = cat.category_id
		    WHERE sl.sent_at > ba.processed_up_to
		      AND sl.sent_at < now() - INTERVAL '24 hours'
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
		    updated_at = now()
		FROM new_loss nl
		WHERE ba.group_id = nl.group_id
		  AND ba.category_id = nl.category_id
	`)
	if err != nil {
		return err
	}

	// 3. Move o cursor processed_up_to para o limiar (now-24h) — só processamos
	//    eventos já estáveis.
	_, err = db.ExecContext(ctx, `
		UPDATE bandit_arms SET processed_up_to = now() - INTERVAL '24 hours'
		WHERE processed_up_to < now() - INTERVAL '24 hours'
	`)
	return err
}

// ensureBanditArmsForGroup cria braços Beta(1,1) faltantes para cada categoria
// listada em channel_category_weights do grupo. Chamado lazy no tick quando
// Thompson está ativo.
func ensureBanditArmsForGroup(ctx context.Context, db *sqlx.DB, groupID, channelID int64) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO bandit_arms (group_id, category_id, alpha, beta, processed_up_to)
		SELECT $1, ccw.category_id, 1.0, 1.0, now() - INTERVAL '24 hours'
		FROM channel_category_weights ccw
		WHERE ccw.channel_id = $2 AND ccw.weight > 0
		ON CONFLICT (group_id, category_id) DO NOTHING
	`, groupID, channelID)
	return err
}
