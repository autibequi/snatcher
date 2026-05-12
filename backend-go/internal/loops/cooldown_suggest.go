package loops

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunCooldownSuggest analisa ban_rate × EPC por modem e propõe ajuste em cooldown_seconds.
// L4 é SEMPRE suggesting (não aplica — Pedrinho aprova via dashboard).
func RunCooldownSuggest(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	type row struct {
		ModemID  int64   `db:"modem_id"`
		Slug     string  `db:"slug"`
		BanRate  float64 `db:"ban_rate"`
		EPC      float64 `db:"epc"`
		Cooldown float64 `db:"cooldown"`
	}
	var rows []row
	if err := db.SelectContext(ctx, &rows, `
		SELECT m.id AS modem_id, m.slug,
		       COALESCE((SELECT COUNT(*) FROM ban_events b WHERE b.modem_id=m.id AND b.detected_at > now()-INTERVAL '30 days')::numeric, 0) AS ban_rate,
		       COALESCE((SELECT AVG(epc_30d) FROM learned_weights), 0) AS epc,
		       COALESCE(get_param('cooldown_seconds','modem',m.id), 90) AS cooldown
		FROM modems m
	`); err != nil {
		return err
	}

	for _, r := range rows {
		var proposed float64 = r.Cooldown
		var reason string
		switch {
		case r.BanRate >= 3:
			proposed = r.Cooldown * 1.2
			reason = "3+ bans em 30d — aumentar cooldown 20%"
		case r.BanRate == 0 && r.EPC > 0:
			proposed = r.Cooldown * 0.95
			reason = "0 bans + EPC positivo — reduzir cooldown 5% (cautelosamente)"
		}
		if proposed == r.Cooldown {
			continue
		}
		if proposed < 45 {
			proposed = 45
		}
		if proposed > 240 {
			proposed = 240
		}

		// resolve param_id
		var paramID int64
		if err := db.GetContext(ctx, &paramID, `
			SELECT id FROM tunable_parameters WHERE param_name='cooldown_seconds' AND scope_type='modem' AND scope_id=$1
		`, r.ModemID); err != nil {
			// se não há scope-specific, sugerir no global
			_ = db.GetContext(ctx, &paramID, `SELECT id FROM tunable_parameters WHERE param_name='cooldown_seconds' AND scope_type='global'`)
		}

		change := map[string]any{
			"param":        "cooldown_seconds",
			"modem":        r.Slug,
			"current":      r.Cooldown,
			"proposed":     proposed,
			"ban_rate_30d": r.BanRate,
			"avg_epc":      r.EPC,
		}
		if err := Suggest(ctx, db, "cooldown_suggest", "tunable_parameters", paramID,
			"Ajustar cooldown_seconds do modem "+r.Slug, change, reason, 0.65); err != nil {
			slog.Error("cooldown_suggest", "err", err)
			continue
		}
		slog.Info("cooldown_suggest", "modem", r.Slug, "old", r.Cooldown, "new", proposed)
	}
	return nil
}
