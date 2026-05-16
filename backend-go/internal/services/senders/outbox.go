package senders

import (
	"context"
	"encoding/json"

	"github.com/jmoiron/sqlx"
)

// Emit insere evento no outbox_events DENTRO de uma TX existente.
// Caller é responsável pelo commit.
func Emit(ctx context.Context, tx *sqlx.Tx, aggregateID, eventType string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO outbox_events (aggregate_id, event_type, payload) VALUES ($1, $2, $3::jsonb)`,
		aggregateID, eventType, string(raw))
	return err
}
