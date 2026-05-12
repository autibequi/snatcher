package middleware

import (
	"fmt"

	"github.com/jmoiron/sqlx"
)

// CheckAndIncrementAccount verifies if the WA account (accounts v2) has reached its daily
// send quota before sending. Returns error if daily_send_quota exceeded.
// sent_today is computed from send_log; quota is accounts.daily_send_quota.
func CheckAndIncrementAccount(db *sqlx.DB, accountID int64) error {
	var row struct {
		SentToday      int `db:"sent_today"`
		DailySendQuota int `db:"daily_send_quota"`
	}
	err := db.Get(&row, `
		SELECT daily_send_quota,
		       COALESCE((SELECT COUNT(*) FROM send_log sl
		                  WHERE sl.account_id = $1
		                    AND sl.sent_at::date = CURRENT_DATE
		                    AND sl.status = 'sent'), 0) AS sent_today
		FROM accounts WHERE id = $1`, accountID)
	if err != nil {
		return fmt.Errorf("throttle: account %d not found: %w", accountID, err)
	}
	if row.DailySendQuota > 0 && row.SentToday >= row.DailySendQuota {
		return fmt.Errorf("throttle: account %d reached daily quota (%d/%d)", accountID, row.SentToday, row.DailySendQuota)
	}
	return nil
}

// CheckAndIncrementTG verifies if the TG account has reached its daily limit before sending.
// Returns error if daily_limit exceeded; atomically increments sent_today if OK.
func CheckAndIncrementTG(db *sqlx.DB, accountID int64) error {
	var row struct {
		SentToday  int `db:"sent_today"`
		DailyLimit int `db:"daily_limit"`
	}
	if err := db.Get(&row, `SELECT sent_today, daily_limit FROM tgaccount WHERE id = $1`, accountID); err != nil {
		return fmt.Errorf("throttle: TG account %d not found: %w", accountID, err)
	}
	if row.DailyLimit > 0 && row.SentToday >= row.DailyLimit {
		return fmt.Errorf("throttle: TG account %d reached daily limit (%d/%d)", accountID, row.SentToday, row.DailyLimit)
	}
	_, err := db.Exec(`UPDATE tgaccount SET sent_today = sent_today + 1 WHERE id = $1`, accountID)
	if err != nil {
		return fmt.Errorf("throttle: failed to increment sent_today: %w", err)
	}
	return nil
}

// ResetDailySentCounters zeroes sent_today in TG accounts (call from daily job).
// WA accounts v2 use send_log for counting — no reset needed.
func ResetDailySentCounters(db *sqlx.DB) error {
	_, err := db.Exec(`UPDATE tgaccount SET sent_today = 0`)
	if err != nil {
		return fmt.Errorf("throttle: failed to reset TG counters: %w", err)
	}
	return nil
}
