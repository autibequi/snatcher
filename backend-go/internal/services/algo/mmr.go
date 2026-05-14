package algo

import (
	"context"
	"sort"

	"github.com/jmoiron/sqlx"
)

// applyMMR re-ranqueia candidatos para penalizar categorias já enviadas hoje
// no grupo. Lambda controla o peso da relevância vs diversidade:
//
//	mmr(i) = lambda * final_score(i) - (1-lambda) * sameCategoryAsToday(i)
//
// lambda = 1 - diversity_bonus_weight (default 0.70 com weight=0.30).
// Retorna a lista re-ranqueada (desc por mmr_score). O argmax é o índice 0.
func applyMMR(candidates []catalogItem, sentTodayCategories map[int64]bool, lambda float64) []catalogItem {
	if len(candidates) == 0 {
		return candidates
	}

	out := make([]catalogItem, len(candidates))
	copy(out, candidates)
	mmrScores := make([]float64, len(out))
	for i, c := range out {
		penalty := 0.0
		if c.CategoryID != nil && sentTodayCategories[*c.CategoryID] {
			penalty = 1.0
		}
		mmrScores[i] = lambda*c.FinalScore - (1-lambda)*penalty
	}

	sort.SliceStable(out, func(i, j int) bool {
		return mmrScores[i] > mmrScores[j]
	})
	return out
}

// loadSentTodayCategories busca categorias já enviadas pro grupo nas últimas
// 24h via send_log. Retorna set como map[int64]bool.
func loadSentTodayCategories(ctx context.Context, db *sqlx.DB, groupID int64) (map[int64]bool, error) {
	rows, err := db.QueryxContext(ctx, `
		SELECT DISTINCT cat.category_id
		FROM send_log sl
		JOIN catalog cat ON cat.id = sl.catalog_id
		WHERE sl.group_id = $1
		  AND sl.sent_at > now() - INTERVAL '24 hours'
		  AND cat.category_id IS NOT NULL
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[int64]bool)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// loadMMRLambda lê diversity_bonus_weight do banco e retorna lambda = 1 - weight.
func loadMMRLambda(ctx context.Context, db *sqlx.DB) float64 {
	var weight float64
	if err := db.GetContext(ctx, &weight,
		`SELECT COALESCE(get_param('diversity_bonus_weight','global',NULL), 0.30)`); err != nil {
		return 0.70 // default seguro
	}
	lambda := 1.0 - weight
	if lambda < 0 {
		lambda = 0
	}
	if lambda > 1 {
		lambda = 1
	}
	return lambda
}
