package jobs

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
)

// RunDailyMetricsJob agrega métricas das últimas 24h e insere em daily_metrics.
// Deve rodar às 23:59 via cron job.
func RunDailyMetricsJob(ctx context.Context, db *sqlx.DB) {
	today := time.Now().UTC().Truncate(24 * time.Hour)
	slog.Info("metrics_daily: iniciando agregação", "date", today.Format("2006-01-02"))

	type metricRow struct {
		metric    string
		dimension map[string]any
		value     float64
	}

	var rows []metricRow

	// ── Envios (sent) por grupo ───────────────────────────────────────────────
	type sentRow struct {
		GroupID int64 `db:"group_id"`
		Count   int64 `db:"cnt"`
	}
	var sentRows []sentRow
	err := db.SelectContext(ctx, &sentRows, `
		SELECT group_id, COUNT(*) AS cnt
		FROM send_log
		WHERE sent_at >= NOW() - INTERVAL '24 hours'
		  AND status = 'sent'
		GROUP BY group_id
	`)
	if err != nil {
		slog.Error("metrics_daily: sent query", "err", err)
	} else {
		for _, r := range sentRows {
			rows = append(rows, metricRow{
				metric:    "sent",
				dimension: map[string]any{"group_id": r.GroupID},
				value:     float64(r.Count),
			})
		}
	}

	// ── Cliques por grupo ─────────────────────────────────────────────────────
	type clickRow struct {
		GroupID *int64 `db:"group_id"`
		Count   int64  `db:"cnt"`
	}
	var clickRows []clickRow
	err = db.SelectContext(ctx, &clickRows, `
		SELECT group_id, COUNT(*) AS cnt
		FROM clicks
		WHERE clicked_at >= NOW() - INTERVAL '24 hours'
		GROUP BY group_id
	`)
	if err != nil {
		slog.Error("metrics_daily: clicks query", "err", err)
	} else {
		for _, r := range clickRows {
			dim := map[string]any{}
			if r.GroupID != nil {
				dim["group_id"] = *r.GroupID
			}
			rows = append(rows, metricRow{
				metric:    "clicks",
				dimension: dim,
				value:     float64(r.Count),
			})
		}
	}

	// ── Conversões e receita por source ───────────────────────────────────────
	type convRow struct {
		SourceID int64   `db:"source_id"`
		Count    int64   `db:"cnt"`
		Revenue  float64 `db:"revenue"`
	}
	var convRows []convRow
	err = db.SelectContext(ctx, &convRows, `
		SELECT source_id, COUNT(*) AS cnt, COALESCE(SUM(order_value), 0) AS revenue
		FROM conversions
		WHERE occurred_at >= NOW() - INTERVAL '24 hours'
		  AND status = 'confirmed'
		GROUP BY source_id
	`)
	if err != nil {
		slog.Error("metrics_daily: conversions query", "err", err)
	} else {
		for _, r := range convRows {
			dim := map[string]any{"source_id": r.SourceID}
			rows = append(rows, metricRow{
				metric:    "conversions",
				dimension: dim,
				value:     float64(r.Count),
			})
			rows = append(rows, metricRow{
				metric:    "revenue",
				dimension: dim,
				value:     r.Revenue,
			})
		}
	}

	// ── Banimentos por modem ──────────────────────────────────────────────────
	type banRow struct {
		ModemID int64 `db:"modem_id"`
		Count   int64 `db:"cnt"`
	}
	var banRows []banRow
	err = db.SelectContext(ctx, &banRows, `
		SELECT modem_id, COUNT(*) AS cnt
		FROM ban_events
		WHERE detected_at >= NOW() - INTERVAL '24 hours'
		GROUP BY modem_id
	`)
	if err != nil {
		slog.Error("metrics_daily: bans query", "err", err)
	} else {
		for _, r := range banRows {
			rows = append(rows, metricRow{
				metric:    "bans",
				dimension: map[string]any{"modem_id": r.ModemID},
				value:     float64(r.Count),
			})
		}
	}

	// ── Upsert em daily_metrics ───────────────────────────────────────────────
	inserted := 0
	for _, row := range rows {
		dimJSON, err := json.Marshal(row.dimension)
		if err != nil {
			slog.Error("metrics_daily: marshal dimension", "err", err)
			continue
		}
		_, err = db.ExecContext(ctx, `
			INSERT INTO daily_metrics (date, metric, dimension, value)
			VALUES ($1, $2, $3::jsonb, $4)
			ON CONFLICT (date, metric, dimension) DO UPDATE
			    SET value = EXCLUDED.value
		`, today, row.metric, string(dimJSON), row.value)
		if err != nil {
			slog.Error("metrics_daily: upsert", "metric", row.metric, "err", err)
			continue
		}
		inserted++
	}

	slog.Info("metrics_daily: concluído", "date", today.Format("2006-01-02"), "rows_upserted", inserted)
}
