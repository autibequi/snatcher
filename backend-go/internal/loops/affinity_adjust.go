package loops

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunAffinityAdjust ajusta group_category_affinity baseado em EPC dos últimos 30d.
// Modo padrão: SUGGESTING (não aplica direto — Pedrinho aprova via dashboard L4 quando UI estiver pronta).
func RunAffinityAdjust(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	type row struct {
		GroupID    int64   `db:"group_id"`
		CategoryID int64   `db:"category_id"`
		EPC30d     float64 `db:"epc_30d"`
		Samples    int     `db:"samples_30d"`
		Current    float64 `db:"affinity"`
	}
	var rows []row
	if err := db.SelectContext(ctx, &rows, `
		SELECT lw.group_id, lw.category_id, COALESCE(lw.epc_30d, 0) AS epc_30d, COALESCE(lw.samples_30d, 0) AS samples_30d,
		       COALESCE(ga.affinity, 0.5) AS affinity
		FROM learned_weights lw
		LEFT JOIN group_category_affinity ga ON ga.group_id=lw.group_id AND ga.category_id=lw.category_id
		WHERE lw.samples_30d >= 50
	`); err != nil {
		return err
	}

	for _, r := range rows {
		// delta máximo 0.10 por iteração
		var newAffinity float64
		if r.EPC30d > 1.0 {
			newAffinity = r.Current + 0.1
		}
		if r.EPC30d < 0.1 && r.Current > 0.1 {
			newAffinity = r.Current - 0.1
		}
		if newAffinity == 0 || newAffinity == r.Current {
			continue
		}
		if newAffinity > 1.0 {
			newAffinity = 1.0
		}
		if newAffinity < 0.05 {
			newAffinity = 0.05
		}

		change := map[string]any{
			"current_affinity":  r.Current,
			"proposed_affinity": newAffinity,
			"epc_30d":           r.EPC30d,
			"samples":           r.Samples,
		}

		if mode == ModeActive {
			_, _ = db.ExecContext(ctx, `
				INSERT INTO group_category_affinity (group_id, category_id, affinity)
				VALUES ($1, $2, $3)
				ON CONFLICT (group_id, category_id) DO UPDATE SET affinity = EXCLUDED.affinity
			`, r.GroupID, r.CategoryID, newAffinity)
			_ = AuditAction(ctx, db, "affinity_adjust", "applied", "group_category_affinity", r.GroupID,
				map[string]any{"affinity": r.Current}, map[string]any{"affinity": newAffinity},
				"EPC-driven adjustment, delta <= 0.10", 0.70)
		} else {
			_ = Suggest(ctx, db, "affinity_adjust", "group_category_affinity", r.GroupID,
				"Ajustar afinidade categoria baseado em EPC", change, "EPC outlier", 0.70)
		}
		slog.Info("affinity_adjust", "group", r.GroupID, "cat", r.CategoryID, "old", r.Current, "new", newAffinity, "epc", r.EPC30d)
	}
	return nil
}
