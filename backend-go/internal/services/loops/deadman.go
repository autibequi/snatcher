package loops

import (
	"context"

	"github.com/jmoiron/sqlx"
)

// AddStrike incrementa strikes_30d e transitiona para 'suggesting' se >= 3.
func AddStrike(ctx context.Context, db *sqlx.DB, loopName string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE llm_autonomy
		SET strikes_30d = strikes_30d + 1, last_strike_at = now(),
		    status = CASE WHEN strikes_30d + 1 >= 3 THEN 'suggesting' ELSE status END,
		    disabled_until = CASE WHEN strikes_30d + 1 >= 3 THEN now() + INTERVAL '7 days' ELSE disabled_until END
		WHERE loop_name = $1
	`, loopName)
	return err
}

// DecayStrikes reduz strikes_30d em loops cujos last_strike_at é antigo. Cron diário.
func DecayStrikes(ctx context.Context, db *sqlx.DB) error {
	_, err := db.ExecContext(ctx, `
		UPDATE llm_autonomy
		SET strikes_30d = GREATEST(strikes_30d - 1, 0)
		WHERE last_strike_at < now() - INTERVAL '10 days' AND strikes_30d > 0
	`)
	return err
}

// LoopStatus retorna o status atual de autonomia.
func LoopStatus(ctx context.Context, db *sqlx.DB, loopName string) (string, error) {
	var s string
	err := db.GetContext(ctx, &s, "SELECT status FROM llm_autonomy WHERE loop_name=$1", loopName)
	return s, err
}
