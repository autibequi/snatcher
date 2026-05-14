package jobs

import (
	"context"
	"log/slog"

	"github.com/jmoiron/sqlx"
)

// RunSentimentAnalyze: placeholder. Análise real depende de:
//   - Histórico de mensagens vindo da Evolution (/chat/findMessages)
//   - LLM call para classificar sentiment por grupo
//
// Por ora, apenas registra que rodou.
// Cron: 0 5 * * * (diário 05:00 — no-op).
func RunSentimentAnalyze(ctx context.Context, db *sqlx.DB) error {
	slog.Info("sentiment_analyze: stub — implementar quando Evolution chat-history estiver disponível")
	return nil
}
