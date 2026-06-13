package sendwindow

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
)

// ShouldEnqueueGroup decide se o grupo deve receber mais um item neste tick,
// baseado em cap diário, envios feitos hoje e tempo restante na janela.
func ShouldEnqueueGroup(ctx context.Context, db *sqlx.DB, groupID int64, cap int) bool {
	if cap <= 0 {
		return false
	}
	var sentToday int
	_ = db.GetContext(ctx, &sentToday, `
		SELECT COUNT(*) FROM send_log
		WHERE group_id = $1
		  AND sent_at::date = CURRENT_DATE
		  AND status = 'sent'
	`, groupID)
	if sentToday >= cap {
		return false
	}

	var lastSent *time.Time
	_ = db.GetContext(ctx, &lastSent, `SELECT MAX(sent_at) FROM send_log WHERE group_id = $1`, groupID)

	remaining := cap - sentToday
	minutesLeft := minutesUntilWindowEnd(ctx, db)
	if minutesLeft <= 0 {
		return false
	}
	targetGap := float64(minutesLeft) / float64(remaining)

	sinceLast := 999.0
	if lastSent != nil {
		sinceLast = time.Since(*lastSent).Minutes()
	}
	return sinceLast >= targetGap*0.5
}

// minutesUntilWindowEnd foi movida para window.go — delegate
