package loops

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunContentOptimize descobre features de conversão por grupo.
// GATE: precisa de >= 60 dias de conversions + status='active' explícito do Pedrinho.
func RunContentOptimize(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode != ModeActive {
		return nil // L9 nunca roda em suggesting
	}

	// Gate temporal: 60 dias de dados
	var n int
	_ = db.GetContext(ctx, &n, "SELECT COUNT(*) FROM conversions WHERE occurred_at > now() - INTERVAL '60 days'")
	if n < 500 {
		slog.Info("content_optimize: gate not met", "conversions_60d", n, "required", 500)
		return nil
	}

	discovered := 0

	// 1. price_range — buckets de R$ 50
	rows, err := db.QueryxContext(ctx, `
		SELECT cv.group_id,
		       FLOOR(c.price_current / 50) * 50 AS price_floor,
		       COUNT(*) AS conv_count,
		       SUM(cv.commission) AS total_commission
		FROM conversions cv
		JOIN catalog c ON c.id = cv.catalog_id
		WHERE cv.occurred_at > now() - INTERVAL '60 days'
		  AND cv.status = 'confirmed'
		GROUP BY cv.group_id, price_floor
		HAVING COUNT(*) >= 5
	`)
	if err != nil {
		slog.Error("content_optimize: price_range query", "err", err)
	} else {
		for rows.Next() {
			var gid int64
			var floor float64
			var count int
			var commission float64
			if err := rows.Scan(&gid, &floor, &count, &commission); err != nil {
				continue
			}

			// baseline geral do grupo
			var baseline float64
			_ = db.GetContext(ctx, &baseline, `
				SELECT COALESCE(AVG(cv.commission),0) FROM conversions cv WHERE cv.group_id=$1 AND cv.occurred_at > now()-INTERVAL '60 days'
			`, gid)
			if baseline == 0 {
				continue
			}
			avgInBucket := commission / float64(count)
			lift := avgInBucket / baseline
			if lift < 1.2 {
				continue // só salvar features com lift relevante
			}
			if lift > 2.0 {
				lift = 2.0 // cap 2× por feature
			}

			featureValue, _ := json.Marshal(map[string]any{"min": floor, "max": floor + 50})
			confidence := float64(count) / 50.0
			if confidence > 1.0 {
				confidence = 1.0
			}

			_, _ = db.ExecContext(ctx, `
				INSERT INTO group_conversion_features (group_id, feature_key, feature_value, conversion_lift, samples, confidence, last_validated, status)
				VALUES ($1, 'price_range', $2, $3, $4, $5, now(), 'active')
				ON CONFLICT (group_id, feature_key, feature_value) DO UPDATE
				SET conversion_lift = EXCLUDED.conversion_lift,
				    samples = EXCLUDED.samples,
				    confidence = EXCLUDED.confidence,
				    last_validated = now(),
				    status = 'active'
			`, gid, featureValue, lift, count, confidence)
			_ = AuditAction(ctx, db, "content_optimize", "applied", "group_conversion_features", gid,
				nil, map[string]any{"feature_key": "price_range", "lift": lift, "samples": count},
				"Discovered via 60d conversions analysis", confidence)
			discovered++
		}
		rows.Close()
	}

	// 2. hour_window — bucket de 3h
	rows2, err := db.QueryxContext(ctx, `
		SELECT cv.group_id,
		       (EXTRACT(HOUR FROM cv.occurred_at)::int / 3) * 3 AS hour_bucket,
		       COUNT(*) AS conv_count,
		       AVG(cv.commission) AS avg_commission
		FROM conversions cv
		WHERE cv.occurred_at > now() - INTERVAL '60 days' AND cv.status='confirmed'
		GROUP BY cv.group_id, hour_bucket
		HAVING COUNT(*) >= 3
	`)
	if err != nil {
		slog.Error("content_optimize: hour_window query", "err", err)
	} else {
		for rows2.Next() {
			var gid int64
			var hour int
			var count int
			var avg float64
			if err := rows2.Scan(&gid, &hour, &count, &avg); err != nil {
				continue
			}
			var baseline float64
			_ = db.GetContext(ctx, &baseline, "SELECT COALESCE(AVG(commission),0) FROM conversions WHERE group_id=$1 AND occurred_at>now()-INTERVAL '60 days'", gid)
			if baseline == 0 {
				continue
			}
			lift := avg / baseline
			if lift < 1.2 {
				continue
			}
			if lift > 2.0 {
				lift = 2.0
			}
			featureValue, _ := json.Marshal(map[string]any{"start_hour": hour, "end_hour": hour + 3})
			confidence := float64(count) / 30.0
			if confidence > 1.0 {
				confidence = 1.0
			}
			_, _ = db.ExecContext(ctx, `
				INSERT INTO group_conversion_features (group_id, feature_key, feature_value, conversion_lift, samples, confidence, last_validated, status)
				VALUES ($1, 'hour_window', $2, $3, $4, $5, now(), 'active')
				ON CONFLICT DO NOTHING
			`, gid, featureValue, lift, count, confidence)
			discovered++
		}
		rows2.Close()
	}

	// 3. expirar features antigas
	res, _ := db.ExecContext(ctx, `
		UPDATE group_conversion_features SET status='expired'
		WHERE status='active' AND (last_validated IS NULL OR last_validated < now() - INTERVAL '60 days')
	`)
	expired := int64(0)
	if res != nil {
		expired, _ = res.RowsAffected()
	}

	slog.Info("content_optimize: done", "discovered", discovered, "expired", expired)
	return nil
}
