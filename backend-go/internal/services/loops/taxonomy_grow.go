package loops

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunTaxonomyGrow promove regras LLM via trust_score e quarentena regras com muitas contradictions.
// Cron semanal domingo 03:00. Sem LLM call por enquanto — apenas mecanica de promocao/quarentena.
func RunTaxonomyGrow(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	if mode == ModeActive {
		// Quarentena: contradictions > applications/3
		rows, _ := db.QueryxContext(ctx, `
			UPDATE taxonomy_rules
			SET enabled = false
			WHERE enabled = true AND source = 'llm_generated' AND contradictions > GREATEST(applications/3, 3)
			RETURNING id, pattern, trust_score
		`)
		n := 0
		if rows != nil {
			for rows.Next() {
				var id int64
				var pat []byte
				var trust float64
				if err := rows.Scan(&id, &pat, &trust); err != nil {
					continue
				}
				var pmap map[string]any
				_ = json.Unmarshal(pat, &pmap)
				_ = AuditAction(ctx, db, "taxonomy_grow", "applied", "taxonomy_rules", id,
					map[string]any{"enabled": true, "trust_score": trust},
					map[string]any{"enabled": false},
					"contradictions > applications/3", 0.95)
				n++
			}
			rows.Close()
		}

		// Promoção: atualizar trust_score
		res, err := db.ExecContext(ctx, `
			UPDATE taxonomy_rules
			SET trust_score = LEAST(GREATEST(applications::numeric / GREATEST(applications + contradictions + 1, 1), 0), 1)
			WHERE source = 'llm_generated' AND enabled = true
		`)
		if err == nil {
			updated, _ := res.RowsAffected()
			slog.Info("taxonomy_grow: done", "quarantined", n, "trust_updated", updated)
		}
		return err
	}

	slog.Info("taxonomy_grow: mode suggesting — no-op (LLM proposal not yet implemented)")
	return nil
}
