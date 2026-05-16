package algo

import (
	"context"
	"math"
	"math/rand"

	"github.com/jmoiron/sqlx"
)

// computeEpsilon retorna a taxa de exploração atual:
//
//	epsilon = epsilon_base * exp(-epsilon_decay_rate * days_since_launch)
//
// "Launch" é aproximado pelo primeiro registro em send_log (MIN(sent_at)).
// Se send_log estiver vazio (sistema novo), days_since_launch=0 e epsilon=epsilon_base.
func computeEpsilon(ctx context.Context, db *sqlx.DB) float64 {
	var row struct {
		Base       float64  `db:"base"`
		DecayRate  float64  `db:"decay_rate"`
		DaysActive *float64 `db:"days_active"`
	}
	err := db.GetContext(ctx, &row, `
		SELECT
		  COALESCE(get_param('epsilon_base','global',NULL), 0.40)        AS base,
		  COALESCE(get_param('epsilon_decay_rate','global',NULL), 0.00035) AS decay_rate,
		  EXTRACT(EPOCH FROM (now() - (SELECT MIN(sent_at) FROM send_log)))
		    / 86400.0 AS days_active
	`)
	if err != nil {
		return 0
	}
	days := 0.0
	if row.DaysActive != nil {
		days = *row.DaysActive
	}
	eps := row.Base * math.Exp(-row.DecayRate*days)
	if eps < 0 {
		return 0
	}
	if eps > 1 {
		return 1
	}
	return eps
}

// pickWithEpsilon recebe os top-K já ranqueados (após scoring v2 + MMR já aplicados
// upstream) e, com probabilidade epsilon, devolve um candidato uniformemente
// amostrado entre eles. Caso contrário, mantém o argmax (índice 0).
//
// W2.B substituirá esta função por UCB1 por canal; mantida aqui até então.
func pickWithEpsilon(ctx context.Context, db *sqlx.DB, candidates []catalogItem) catalogItem {
	if len(candidates) == 0 {
		return catalogItem{}
	}
	if len(candidates) == 1 {
		return candidates[0]
	}

	eps := computeEpsilon(ctx, db)
	if rand.Float64() >= eps {
		return candidates[0]
	}
	// Exploração: uniforme entre os top-K (não 100% aleatório global —
	// preserva os filtros de qualidade e MMR).
	return candidates[rand.Intn(len(candidates))]
}
