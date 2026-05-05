package middleware

import (
	"fmt"

	"github.com/jmoiron/sqlx"
)

// CheckAndIncrementWA verifies if the WA account has reached its daily limit before sending.
// Returns error if daily_limit exceeded; atomically increments sent_today if OK.
func CheckAndIncrementWA(db *sqlx.DB, accountID int64) error {
	var row struct {
		SentToday  int `db:"sent_today"`
		DailyLimit int `db:"daily_limit"`
	}
	if err := db.Get(&row, `SELECT sent_today, daily_limit FROM waaccount WHERE id = $1`, accountID); err != nil {
		return fmt.Errorf("throttle: WA account %d not found: %w", accountID, err)
	}
	if row.DailyLimit > 0 && row.SentToday >= row.DailyLimit {
		return fmt.Errorf("throttle: WA account %d reached daily limit (%d/%d)", accountID, row.SentToday, row.DailyLimit)
	}
	_, err := db.Exec(`UPDATE waaccount SET sent_today = sent_today + 1 WHERE id = $1`, accountID)
	if err != nil {
		return fmt.Errorf("throttle: failed to increment sent_today: %w", err)
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

// ResetDailySentCounters zeroes sent_today in all accounts (call from daily job).
func ResetDailySentCounters(db *sqlx.DB) error {
	_, err := db.Exec(`UPDATE waaccount SET sent_today = 0; UPDATE tgaccount SET sent_today = 0`)
	if err != nil {
		return fmt.Errorf("throttle: failed to reset counters: %w", err)
	}
	return nil
}
