package webhooks

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// PollAmazonConversions consome relatório de comissões via API Amazon Associates.
// Cron 1h. Idempotente via UNIQUE (external_tx_id, source_id).
func PollAmazonConversions(ctx context.Context, db *sqlx.DB) error {
	// TODO: integrar com Amazon Reporting API quando credenciais disponíveis
	// Por ora: stub que loga "not configured" se ENV vars faltarem
	slog.Info("amazon.poll: stub — implementar quando credenciais disponíveis")
	return nil
}
