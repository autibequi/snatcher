package loops

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunCapSuggest analisa decay do grupo (CTR drop) e sugere daily_msg_cap.
func RunCapSuggest(ctx context.Context, db *sqlx.DB, mode RunMode) error {
	if mode == ModeDisabled {
		return nil
	}

	type row struct {
		GroupID    int64  `db:"group_id"`
		Name       string `db:"name"`
		Sent14d    int    `db:"sent_14d"`
		Clicks14d  int    `db:"clicks_14d"`
		SentPrev   int    `db:"sent_prev_14d"`
		ClicksPrev int    `db:"clicks_prev_14d"`
		CurrentCap int    `db:"current_cap"`
	}
	var rows []row
	if err := db.SelectContext(ctx, &rows, `
		SELECT d.group_id, d.name, d.sent_14d, d.clicks_14d, d.sent_prev_14d, d.clicks_prev_14d,
		       COALESCE(g.daily_msg_cap, 30) AS current_cap
		FROM mv_group_decay d JOIN groups g ON g.id = d.group_id
		WHERE d.sent_prev_14d >= 50
	`); err != nil {
		return err
	}

	for _, r := range rows {
		ctrNow := 0.0
		ctrPrev := 0.0
		if r.Sent14d > 0 {
			ctrNow = float64(r.Clicks14d) / float64(r.Sent14d)
		}
		if r.SentPrev > 0 {
			ctrPrev = float64(r.ClicksPrev) / float64(r.SentPrev)
		}
		if ctrPrev == 0 {
			continue
		}
		decay := (ctrPrev - ctrNow) / ctrPrev
		var proposed int = r.CurrentCap
		var reason string
		switch {
		case decay > 0.5:
			proposed = r.CurrentCap - 5
			reason = "CTR caiu >50% — reduzir cap pra evitar fadiga"
		case decay < -0.2 && r.CurrentCap < 50:
			proposed = r.CurrentCap + 5
			reason = "CTR cresceu — espaço pra aumentar cap"
		}
		if proposed == r.CurrentCap {
			continue
		}
		if proposed < 5 {
			proposed = 5
		}
		if proposed > 100 {
			proposed = 100
		}

		change := map[string]any{
			"param":    "daily_msg_cap",
			"group":    r.Name,
			"current":  r.CurrentCap,
			"proposed": proposed,
			"ctr_now":  ctrNow,
			"ctr_prev": ctrPrev,
			"decay":    decay,
		}
		if err := Suggest(ctx, db, "cap_suggest", "groups", r.GroupID,
			"Ajustar daily_msg_cap do grupo "+r.Name, change, reason, 0.7); err != nil {
			slog.Error("cap_suggest", "err", err)
			continue
		}
		slog.Info("cap_suggest", "group", r.Name, "old", r.CurrentCap, "new", proposed, "decay", decay)
	}
	return nil
}
