package algo

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
)

// recordTickResult persiste o resultado do último tick em algo_status (1 linha).
// errMsg vazio = tick ok.
func recordTickResult(db *sqlx.DB, started time.Time, enqueued int, errMsg string) {
	durMs := int(time.Since(started).Milliseconds())
	var errVal *string
	if errMsg != "" {
		errVal = &errMsg
	}
	_, _ = db.Exec(`
		UPDATE algo_status SET
			last_tick_at    = $1,
			last_error      = $2,
			last_enqueued   = $3,
			tick_duration_ms = $4,
			updated_at      = now()
		WHERE id = 1
	`, started, errVal, enqueued, durMs)
}

// AlgoStatusRow é retornado pelo handler de status do dashboard.
type AlgoStatusRow struct {
	LastTickAt     *time.Time `db:"last_tick_at"     json:"last_tick_at"`
	LastError      *string    `db:"last_error"       json:"last_error"`
	LastEnqueued   *int       `db:"last_enqueued"    json:"last_enqueued"`
	TickDurationMs *int       `db:"tick_duration_ms" json:"tick_duration_ms"`
	UpdatedAt      time.Time  `db:"updated_at"       json:"updated_at"`
}

func GetAlgoStatus(ctx context.Context, db *sqlx.DB) (*AlgoStatusRow, error) {
	var s AlgoStatusRow
	if err := db.GetContext(ctx, &s, `SELECT last_tick_at, last_error, last_enqueued, tick_duration_ms, updated_at FROM algo_status WHERE id = 1`); err != nil {
		return nil, err
	}
	return &s, nil
}
