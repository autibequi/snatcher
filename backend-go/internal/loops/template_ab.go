package loops

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunTemplateAB: para cada categoria, avalia CTR por template e rebalanceia weights.
// Versão inicial: detecta templates com CTR muito abaixo da média e baixa weight.
func RunTemplateAB(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	type tmplStats struct {
		TemplateID int64   `db:"template_id"`
		CategoryID int64   `db:"category_id"`
		Sent       int     `db:"sent"`
		Clicks     int     `db:"clicks"`
		Weight     int     `db:"weight"`
	}
	var stats []tmplStats
	if err := db.SelectContext(ctx, &stats, `
		SELECT
		    t.id AS template_id,
		    t.category_id,
		    t.weight,
		    COUNT(DISTINCT sl.id) AS sent,
		    COUNT(DISTINCT cl.id) AS clicks
		FROM templates t
		LEFT JOIN send_log sl ON sl.template_id = t.id AND sl.sent_at > now() - INTERVAL '14 days'
		LEFT JOIN catalog c ON c.id = sl.catalog_id
		LEFT JOIN clicks cl ON cl.short_id = c.short_id AND cl.clicked_at > now() - INTERVAL '14 days'
		WHERE t.enabled = true
		GROUP BY t.id, t.category_id, t.weight
		HAVING COUNT(DISTINCT sl.id) >= 50
	`); err != nil {
		return err
	}

	// agrupa por categoria, compara CTR vs média
	byCat := map[int64][]tmplStats{}
	for _, s := range stats {
		byCat[s.CategoryID] = append(byCat[s.CategoryID], s)
	}
	for cat, ts := range byCat {
		var avgCTR float64
		var n int
		for _, s := range ts {
			if s.Sent > 0 {
				avgCTR += float64(s.Clicks) / float64(s.Sent)
				n++
			}
		}
		if n == 0 {
			continue
		}
		avgCTR /= float64(n)
		for _, s := range ts {
			if s.Sent == 0 {
				continue
			}
			ctr := float64(s.Clicks) / float64(s.Sent)
			if ctr < avgCTR*0.5 && s.Weight > 1 {
				newWeight := s.Weight - 1
				if mode == ModeActive {
					_, _ = db.ExecContext(ctx, "UPDATE templates SET weight=$1 WHERE id=$2", newWeight, s.TemplateID)
					_ = AuditAction(ctx, db, "template_ab", "applied", "templates", s.TemplateID,
						map[string]any{"weight": s.Weight, "ctr": ctr},
						map[string]any{"weight": newWeight}, "CTR < 50% da média da categoria", 0.75)
				} else {
					_ = Suggest(ctx, db, "template_ab", "templates", s.TemplateID,
						"Reduzir weight do template (CTR baixo)",
						map[string]any{"current_weight": s.Weight, "proposed_weight": newWeight, "ctr": ctr},
						"CTR < 50% da média da categoria", 0.75)
				}
				slog.Info("template_ab.adjust", "tid", s.TemplateID, "cat", cat, "old_w", s.Weight, "new_w", newWeight, "ctr", ctr, "avg", avgCTR)
			}
		}
	}
	return nil
}
