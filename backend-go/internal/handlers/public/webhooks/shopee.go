package webhooks

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// PollShopeeConversions consome relatório de comissões via API Shopee Affiliate.
// Cron 1h. Idempotente via UNIQUE (external_tx_id, source_id).
// Shopee não tem webhook público — usa API de relatórios polling.
func PollShopeeConversions(ctx context.Context, db *sqlx.DB) error {
	// TODO: integrar com Shopee Affiliate Reporting API quando credenciais disponíveis
	// Por ora: stub que loga "not configured" se ENV vars faltarem
	slog.Info("shopee.poll: stub — implementar quando credenciais disponíveis")
	return nil
}
