package loops

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/jmoiron/sqlx"
)

// RunAnomalyPause detecta anomalias via mv_anomaly_signals e pausa modems/grupos.
func RunAnomalyPause(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	type sig struct {
		Scope     string `db:"scope"`
		ScopeID   int64  `db:"scope_id"`
		Label     string `db:"scope_label"`
		Bans24h   int    `db:"bans_24h"`
		Failed24h int    `db:"failed_24h"`
		Total24h  int    `db:"total_24h"`
	}
	var sigs []sig
	if err := db.SelectContext(ctx, &sigs, "SELECT scope, scope_id, scope_label, bans_24h, failed_24h, total_24h FROM mv_anomaly_signals"); err != nil {
		return err
	}

	for _, s := range sigs {
		// critério: ban_rate >= 30% OU error_rate >= 50%
		var banRate, errRate float64
		if s.Total24h > 0 {
			errRate = float64(s.Failed24h) / float64(s.Total24h)
		}
		if s.Bans24h >= 2 {
			banRate = 1.0
		}

		if banRate >= 1.0 || errRate >= 0.5 {
			if mode == ModeActive && s.Scope == "modem" {
				// já é pausado pelo sender se 2+ bans/24h, mas registramos system_pauses
				snapshot := fmt.Sprintf(`{"scope":"%s","scope_id":%s,"bans_24h":%s,"err_rate":%s}`,
					s.Scope,
					strconv.FormatInt(s.ScopeID, 10),
					strconv.Itoa(s.Bans24h),
					strconv.FormatFloat(errRate, 'f', 4, 64),
				)
				_, _ = db.ExecContext(ctx, `
					INSERT INTO system_pauses (triggered_by, reasoning, signals_snapshot, paused_at)
					VALUES ('llm_loop_6', $1, $2, now())
				`, "ban_rate or err_rate critical", []byte(snapshot))
				_ = AuditAction(ctx, db, "anomaly_pause", "applied", "modems", s.ScopeID,
					map[string]any{"status": "active"}, map[string]any{"status": "paused"},
					"ban_rate ou err_rate crítico", 0.90)
			} else {
				_ = Suggest(ctx, db, "anomaly_pause", s.Scope, s.ScopeID,
					"Anomalia detectada — sugerir pause",
					map[string]any{"bans_24h": s.Bans24h, "err_rate": errRate}, "Critério crítico atingido", 0.90)
			}
			slog.Warn("anomaly_pause.trigger", "scope", s.Scope, "id", s.ScopeID, "bans", s.Bans24h, "err_rate", errRate)
		}
	}
	return nil
}
