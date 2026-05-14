package curator

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

// RunDailyReport agrega métricas das últimas 24h e envia ao grupo 'tracking'.
// Cron diário 08:00 America/Sao_Paulo (11:00 UTC).
func RunDailyReport(ctx context.Context, db *sqlx.DB, sender Sender) error {
	type metricRow struct {
		Metric string  `db:"metric"`
		Total  float64 `db:"total"`
	}
	var rows []metricRow
	if err := db.SelectContext(ctx, &rows, `
		SELECT metric, COALESCE(SUM(value), 0) AS total
		FROM daily_metrics
		WHERE date = CURRENT_DATE - 1
		GROUP BY metric ORDER BY metric
	`); err != nil {
		return err
	}

	var msg strings.Builder
	yesterday := time.Now().AddDate(0, 0, -1).Format("02/01")
	fmt.Fprintf(&msg, "📊 *Relatório diário — %s*\n\n", yesterday)

	if len(rows) == 0 {
		msg.WriteString("Sem dados consolidados ontem.\n")
	} else {
		for _, r := range rows {
			fmt.Fprintf(&msg, "• %s: %.2f\n", r.Metric, r.Total)
		}
	}

	// top 3 grupos por comissão
	type epcRow struct {
		GroupName  string  `db:"name"`
		Commission float64 `db:"commission"`
	}
	var top []epcRow
	_ = db.SelectContext(ctx, &top, `
		SELECT g.name, COALESCE(SUM(c.commission), 0) AS commission
		FROM conversions c JOIN groups g ON g.id = c.group_id
		WHERE c.occurred_at::date = CURRENT_DATE - 1
		GROUP BY g.name ORDER BY commission DESC LIMIT 3
	`)
	if len(top) > 0 {
		msg.WriteString("\n*Top 3 grupos por comissão:*\n")
		for i, r := range top {
			fmt.Fprintf(&msg, "%d. %s — R$ %.2f\n", i+1, r.GroupName, r.Commission)
		}
	}

	return DispatchToGroup(ctx, db, sender, "tracking", msg.String())
}
