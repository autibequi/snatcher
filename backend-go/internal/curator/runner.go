package curator

import (
	"context"
	"log/slog"
	"time"

	"github.com/jmoiron/sqlx"
)

// Event representa um sinal coletado para o curator classificar.
type Event struct {
	Kind       string         `json:"kind"`        // "ban", "heartbeat_stale", "alert_rule_fired", "system_pause", "loop_strike", "anomaly"
	Scope      string         `json:"scope"`
	ScopeID    int64          `json:"scope_id"`
	Severity   string         `json:"severity"` // "critical" | "warning" | "info"
	Detail     map[string]any `json:"detail"`
	OccurredAt time.Time      `json:"occurred_at"`
}

// CollectEvents reúne eventos recentes (últimos 5 minutos) de várias fontes.
func CollectEvents(ctx context.Context, db *sqlx.DB) ([]Event, error) {
	events := []Event{}

	// 1. ban_events últimos 5min
	rows, err := db.QueryxContext(ctx, `
		SELECT id, modem_id, account_id, reason, detected_at
		FROM ban_events WHERE detected_at > now() - INTERVAL '5 min'
	`)
	if err != nil {
		slog.Warn("curator.collect: ban_events query failed", "err", err)
	} else {
		for rows.Next() {
			var id, modem, account int64
			var reason string
			var t time.Time
			if err := rows.Scan(&id, &modem, &account, &reason, &t); err == nil {
				events = append(events, Event{
					Kind: "ban", Scope: "modem", ScopeID: modem, Severity: "critical",
					Detail:     map[string]any{"account_id": account, "reason": reason, "ban_id": id},
					OccurredAt: t,
				})
			}
		}
		rows.Close()
	}

	// 2. system_pauses novos
	rows, err = db.QueryxContext(ctx, `
		SELECT id, triggered_by, reasoning, paused_at
		FROM system_pauses WHERE paused_at > now() - INTERVAL '5 min' AND resumed_at IS NULL
	`)
	if err != nil {
		slog.Warn("curator.collect: system_pauses query failed", "err", err)
	} else {
		for rows.Next() {
			var id int64
			var trig, reason string
			var t time.Time
			if err := rows.Scan(&id, &trig, &reason, &t); err == nil {
				events = append(events, Event{
					Kind: "system_pause", Scope: "system", ScopeID: id, Severity: "critical",
					Detail:     map[string]any{"triggered_by": trig, "reasoning": reason},
					OccurredAt: t,
				})
			}
		}
		rows.Close()
	}

	// 3. heartbeat stale: componentes que não bateram há mais de 5min
	rows, err = db.QueryxContext(ctx, `
		SELECT name, last_beat FROM component_heartbeat WHERE last_beat < now() - INTERVAL '5 min'
	`)
	if err != nil {
		slog.Warn("curator.collect: component_heartbeat query failed", "err", err)
	} else {
		for rows.Next() {
			var name string
			var t time.Time
			if err := rows.Scan(&name, &t); err == nil {
				events = append(events, Event{
					Kind: "heartbeat_stale", Scope: "component", ScopeID: 0, Severity: "warning",
					Detail:     map[string]any{"component": name, "last_beat": t},
					OccurredAt: t,
				})
			}
		}
		rows.Close()
	}

	// 4. loops com status mudado para suggesting (strikes >=3)
	rows, err = db.QueryxContext(ctx, `
		SELECT loop_name, strikes_30d, last_strike_at
		FROM llm_autonomy WHERE status='suggesting' AND last_strike_at > now() - INTERVAL '5 min'
	`)
	if err != nil {
		slog.Warn("curator.collect: llm_autonomy query failed", "err", err)
	} else {
		for rows.Next() {
			var name string
			var strikes int
			var t time.Time
			if err := rows.Scan(&name, &strikes, &t); err == nil {
				events = append(events, Event{
					Kind: "loop_strike", Scope: "loop", ScopeID: 0, Severity: "critical",
					Detail:     map[string]any{"loop_name": name, "strikes": strikes},
					OccurredAt: t,
				})
			}
		}
		rows.Close()
	}

	// 5. anomaly_signals com critério crítico
	rows, err = db.QueryxContext(ctx, `
		SELECT scope, scope_id, scope_label, bans_24h, failed_24h, total_24h
		FROM mv_anomaly_signals
		WHERE bans_24h >= 2 OR (total_24h > 10 AND failed_24h::numeric / total_24h > 0.5)
	`)
	if err != nil {
		slog.Warn("curator.collect: mv_anomaly_signals query failed", "err", err)
	} else {
		for rows.Next() {
			var scope, label string
			var id int64
			var bans, failed, total int
			if err := rows.Scan(&scope, &id, &label, &bans, &failed, &total); err == nil {
				events = append(events, Event{
					Kind: "anomaly", Scope: scope, ScopeID: id, Severity: "critical",
					Detail: map[string]any{
						"label": label, "bans_24h": bans,
						"failed_24h": failed, "total_24h": total,
					},
					OccurredAt: time.Now(),
				})
			}
		}
		rows.Close()
	}

	// 6. group health alerts (Fase 8)
	healthEvents, _ := EmitGroupHealthAlerts(ctx, db)
	events = append(events, healthEvents...)

	return events, nil
}

// RunCuratorTick coleta eventos, classifica via classifier, e envia ao grupo correto.
// Cron 5min.
func RunCuratorTick(ctx context.Context, db *sqlx.DB, sender Sender) error {
	events, err := CollectEvents(ctx, db)
	if err != nil {
		return err
	}
	if len(events) == 0 {
		return nil
	}

	msgs := Classify(events)
	for _, m := range msgs {
		if m.Target == "ignore" {
			continue
		}
		if err := DispatchToGroup(ctx, db, sender, m.Target, m.Message); err != nil {
			slog.Error("curator.dispatch", "target", m.Target, "err", err)
			continue
		}
	}
	return nil
}
