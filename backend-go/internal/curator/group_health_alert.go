package curator

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// EmitGroupHealthAlerts olha mv_group_health e cria events para o curator se algum grupo está em risco.
// Chamado dentro de CollectEvents (Fase 8) ou como cron independente.
// Critérios de alerta:
//   - ctr_drop_pct > 50% (CTR caiu mais de 50% em relação ao período anterior de 14d)
//   - OU sentiment_score < 0.5 (proxy: alta taxa de falha de envio)
//   - E sent_14d >= 20 (volume mínimo para signal statistically relevant)
func EmitGroupHealthAlerts(ctx context.Context, db *sqlx.DB) ([]Event, error) {
	type row struct {
		GroupID   int64   `db:"group_id"`
		Name      string  `db:"name"`
		CTRDrop   float64 `db:"ctr_drop_pct"`
		Sentiment float64 `db:"sentiment_score"`
		Sent14d   int     `db:"sent_14d"`
	}
	var rows []row
	if err := db.SelectContext(ctx, &rows, `
		SELECT group_id, name, ctr_drop_pct, sentiment_score, sent_14d
		FROM mv_group_health
		WHERE (ctr_drop_pct > 50 OR sentiment_score < 0.5) AND sent_14d >= 20
	`); err != nil {
		return nil, err
	}

	out := []Event{}
	for _, r := range rows {
		sev := "warning"
		if r.CTRDrop > 70 || r.Sentiment < 0.3 {
			sev = "critical"
		}
		out = append(out, Event{
			Kind: "group_decay", Scope: "group", ScopeID: r.GroupID, Severity: sev,
			Detail: map[string]any{
				"name":            r.Name,
				"ctr_drop_pct":    fmt.Sprintf("%.1f", r.CTRDrop),
				"sentiment_score": fmt.Sprintf("%.2f", r.Sentiment),
				"sent_14d":        r.Sent14d,
			},
		})
		slog.Warn("group_decay.detected",
			"group", r.Name,
			"ctr_drop", r.CTRDrop,
			"sentiment", r.Sentiment,
			"sent_14d", r.Sent14d,
		)
	}
	return out, nil
}
