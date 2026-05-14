package loops

import (
	"context"
	"log/slog"
	"math"
	"time"

	"github.com/jmoiron/sqlx"
)

// RunAutoTuning mensal: propõe A/B em parâmetros + avalia A/Bs existentes.
func RunAutoTuning(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	// 1) Avaliar A/Bs existentes
	if err := evaluateRunningABTests(ctx, db, mode); err != nil {
		slog.Error("auto_tuning.evaluate", "err", err)
	}

	// 2) Propor novos A/Bs (max 3 ativos)
	var running int
	_ = db.GetContext(ctx, &running, "SELECT COUNT(*) FROM parameter_ab_tests WHERE status='running'")
	if running >= 3 {
		slog.Info("auto_tuning: 3 A/Bs já ativos, skip new")
		return nil
	}

	// candidatos: parâmetros com volatilidade conhecida (heurística simples — pegar 1 dos globais)
	type param struct {
		ID           int64   `db:"id"`
		ParamName    string  `db:"param_name"`
		CurrentValue float64 `db:"current_value"`
		MinValue     float64 `db:"min_value"`
		MaxValue     float64 `db:"max_value"`
	}
	var ps []param
	_ = db.SelectContext(ctx, &ps, `
		SELECT id, param_name, current_value, min_value, max_value
		FROM tunable_parameters
		WHERE scope_type='global'
		  AND id NOT IN (SELECT param_id FROM parameter_ab_tests WHERE status='running')
		ORDER BY random() LIMIT 1
	`)
	for _, p := range ps {
		// delta máximo 15%
		delta := p.CurrentValue * 0.15
		proposed := p.CurrentValue + delta
		if proposed > p.MaxValue {
			proposed = p.MaxValue
		}
		if proposed < p.MinValue {
			proposed = p.MinValue
		}
		if proposed == p.CurrentValue {
			continue
		}

		endsAt := time.Now().AddDate(0, 0, 14)
		if mode == ModeActive {
			_, _ = db.ExecContext(ctx, `
				INSERT INTO parameter_ab_tests (param_id, proposed_value, weight_pct, metric_name, ends_at)
				VALUES ($1, $2, 30, 'epc', $3)
			`, p.ID, proposed, endsAt)
			_ = AuditAction(ctx, db, "auto_tuning", "applied", "parameter_ab_tests", p.ID,
				map[string]any{"current": p.CurrentValue},
				map[string]any{"proposed": proposed, "ends_at": endsAt},
				"A/B test proposed", 0.6)
			slog.Info("auto_tuning: A/B started", "param", p.ParamName, "old", p.CurrentValue, "new", proposed)
		} else {
			_ = Suggest(ctx, db, "auto_tuning", "tunable_parameters", p.ID,
				"Propor A/B test em "+p.ParamName,
				map[string]any{"current": p.CurrentValue, "proposed": proposed, "weight_pct": 30},
				"Exploration de parâmetro global", 0.6)
		}
	}
	return nil
}

func evaluateRunningABTests(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	type ab struct {
		ID        int64     `db:"id"`
		ParamID   int64     `db:"param_id"`
		Proposed  float64   `db:"proposed_value"`
		Metric    string    `db:"metric_name"`
		SamplesB  int       `db:"samples_baseline"`
		SamplesT  int       `db:"samples_test"`
		MetricB   *float64  `db:"metric_baseline"`
		MetricT   *float64  `db:"metric_test"`
		EndsAt    time.Time `db:"ends_at"`
	}
	var abs []ab
	_ = db.SelectContext(ctx, &abs, "SELECT id, param_id, proposed_value, metric_name, samples_baseline, samples_test, metric_baseline, metric_test, ends_at FROM parameter_ab_tests WHERE status='running'")

	for _, a := range abs {
		if time.Now().Before(a.EndsAt) && (a.SamplesB < 200 || a.SamplesT < 200) {
			continue // ainda em andamento
		}
		if a.SamplesB < 200 || a.SamplesT < 200 {
			// expirou sem dados suficientes — rollback
			_, _ = db.ExecContext(ctx, "UPDATE parameter_ab_tests SET status='rolled_back', decided_at=now() WHERE id=$1", a.ID)
			_ = AuditAction(ctx, db, "auto_tuning", "rolled_back", "parameter_ab_tests", a.ID, nil, nil, "insuficient samples after ends_at", 0.95)
			continue
		}
		if a.MetricB == nil || a.MetricT == nil {
			continue
		}
		diff := *a.MetricT - *a.MetricB
		// significância heurística: diff > 5% e samples >= 200
		if math.Abs(diff/(*a.MetricB+0.0001)) > 0.05 && diff > 0 {
			if mode == ModeActive {
				_, _ = db.ExecContext(ctx, "UPDATE tunable_parameters SET current_value=$1, last_changed=now(), last_change_by='l8_tuning' WHERE id=$2", a.Proposed, a.ParamID)
				_, _ = db.ExecContext(ctx, "UPDATE parameter_ab_tests SET status='promoted', decided_at=now() WHERE id=$1", a.ID)
				_ = AuditAction(ctx, db, "auto_tuning", "promoted", "tunable_parameters", a.ParamID,
					map[string]any{"metric_baseline": *a.MetricB}, map[string]any{"metric_test": *a.MetricT}, "A/B test promoted", 0.85)
			}
		} else {
			_, _ = db.ExecContext(ctx, "UPDATE parameter_ab_tests SET status='rolled_back', decided_at=now() WHERE id=$1", a.ID)
			_ = AuditAction(ctx, db, "auto_tuning", "rolled_back", "parameter_ab_tests", a.ID, nil, map[string]any{"diff": diff}, "not significant", 0.85)
		}
	}
	return nil
}
